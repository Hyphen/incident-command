import type { Qified, TaskProvider } from "qified";
import type { QueueProviderId } from "../domain/types";

/** The queue name for notification jobs. */
export const QUEUE_NAME = "incident-command.notifications";

/** The time a task may run before the provider sends it again. */
export const TASK_TIMEOUT_MS = 10 * 60 * 1000;

export type QueueRun = (
	jobId: string,
	keepAlive: () => Promise<void>,
) => Promise<void>;

export interface QueueTransport {
	enqueue(jobId: string): Promise<void>;
	consume(run: QueueRun): Promise<void>;
	close(): Promise<void>;
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function errorMethod(
	source: object,
):
	| ((event: "error", handler: (error: unknown) => void) => unknown)
	| undefined {
	if (!("on" in source) || typeof source.on !== "function") {
		return undefined;
	}
	return source.on.bind(source) as (
		event: "error",
		handler: (error: unknown) => void,
	) => unknown;
}

/** Logs provider errors. A missing listener can stop the process. */
export function listen(source: object, onError: (error: Error) => void): void {
	errorMethod(source)?.("error", (error: unknown) => onError(asError(error)));
}

/**
 * Runs one queue call. Qified reports a failure as an error event and then
 * returns. This function rejects when that event fires.
 */
export async function strict<T>(
	source: object,
	op: () => Promise<T>,
): Promise<T> {
	let failure: Error | undefined;
	errorMethod(source)?.("error", (error: unknown) => {
		failure = asError(error);
	});
	const result = await op();
	if (failure) {
		throw failure;
	}
	return result;
}

function jobIdOf(data: unknown): string | undefined {
	if (typeof data !== "object" || data === null || !("jobId" in data)) {
		return undefined;
	}
	const id = data.jobId;
	return typeof id === "string" ? id : undefined;
}

/** A transport that uses qified tasks. */
export function taskTransport(
	qified: Qified,
	onError: (error: Error) => void,
): QueueTransport {
	listen(qified, onError);
	return {
		async enqueue(jobId) {
			const ids = await strict(qified, () =>
				qified.enqueue(QUEUE_NAME, {
					data: { jobId },
					timeout: TASK_TIMEOUT_MS,
					maxRetries: 3,
				}),
			);
			if (ids.length === 0) {
				throw new Error("The queue did not accept the task");
			}
		},
		async consume(run) {
			await strict(qified, () =>
				qified.dequeue(QUEUE_NAME, {
					id: "incident-command.notifications",
					handler: async (task, context) => {
						const jobId = jobIdOf(task.data);
						if (!jobId) {
							await context.reject(false);
							return;
						}
						try {
							await run(jobId, () => context.extend(TASK_TIMEOUT_MS));
							await context.ack();
						} catch {
							await context.reject(true);
						}
					},
				}),
			);
		},
		async close() {
			await qified.disconnect();
		},
	};
}

/** A transport that uses qified messages. ZeroMQ uses this. */
export function messageTransport(
	qified: Qified,
	onError: (error: Error) => void,
): QueueTransport {
	listen(qified, onError);
	return {
		async enqueue(jobId) {
			await strict(qified, () =>
				qified.publish(QUEUE_NAME, { id: jobId, data: { jobId } }),
			);
		},
		async consume(run) {
			await strict(qified, () =>
				qified.subscribe(QUEUE_NAME, {
					id: "incident-command.notifications",
					handler: async (message) => {
						const jobId = jobIdOf(message.data);
						if (!jobId) {
							return;
						}
						void run(jobId, async () => {}).catch((error: unknown) =>
							onError(asError(error)),
						);
					},
				}),
			);
		},
		async close() {
			await qified.disconnect();
		},
	};
}

function taskOf(provider: TaskProvider, onError: (error: Error) => void) {
	listen(provider, onError);
	return import("qified").then(
		({ Qified }) => new Qified({ taskProviders: [provider] }),
	);
}

/**
 * Builds the transport for one provider. Each broker package loads only for
 * its own id.
 */
export async function createTransport(
	id: QueueProviderId,
	uri: string | undefined,
	onError: (error: Error) => void,
): Promise<QueueTransport> {
	const options = uri ? { uri } : {};
	switch (id) {
		case "memory": {
			const { MemoryTaskProvider, Qified } = await import("qified");
			const provider = new MemoryTaskProvider();
			listen(provider, onError);
			return taskTransport(new Qified({ taskProviders: [provider] }), onError);
		}
		case "redis": {
			const { RedisTaskProvider } = await import("@qified/redis");
			return taskTransport(
				await taskOf(new RedisTaskProvider(options), onError),
				onError,
			);
		}
		case "rabbitmq": {
			const { RabbitMqTaskProvider } = await import("@qified/rabbitmq");
			return taskTransport(
				await taskOf(new RabbitMqTaskProvider(options), onError),
				onError,
			);
		}
		case "nats": {
			const { NatsTaskProvider } = await import("@qified/nats");
			return taskTransport(
				await taskOf(new NatsTaskProvider(options), onError),
				onError,
			);
		}
		case "zeromq": {
			const { ZmqMessageProvider } = await import("@qified/zeromq");
			const { Qified } = await import("qified");
			const provider = new ZmqMessageProvider(options);
			listen(provider, onError);
			return messageTransport(
				new Qified({ messageProviders: [provider] }),
				onError,
			);
		}
	}
}
