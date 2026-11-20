import type { QueueProviderId } from "../domain/types";
import type { QueueRun, QueueTransport } from "./queue-providers";

/** The time a broker call may take before the send continues here. */
const ENQUEUE_TIMEOUT_MS = 5000;

const loadProviders = () => import("./queue-providers");

/** Hides a user and a password in a connection URI. */
export function redactUri(message: string): string {
	return message.replace(/\/\/[^/\s]*@/g, "//***@");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("The queue did not answer in time"));
		}, ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/**
 * One qified transport for the saved queue. The provider package loads on
 * the first open.
 */
export class NotificationQueue {
	private current?: { version: string; transport: QueueTransport };
	private readonly report: (error: Error) => void;
	private runner: QueueRun = async () => {};

	constructor(onError?: (error: Error) => void) {
		const log =
			onError ??
			((error: Error) => console.error(`[notifications] ${error.message}`));
		this.report = (error) => {
			log(new Error(redactUri(error.message), { cause: error }));
		};
	}

	/** The function that runs one job. Set it before the first open. */
	setRunner(runner: QueueRun): void {
		this.runner = runner;
	}

	/**
	 * Opens the saved provider and starts the consumer. `load` means the
	 * package or the broker did not open.
	 */
	async open(
		provider: QueueProviderId,
		uri: string | undefined,
		revision: number,
	): Promise<"ok" | "load"> {
		const version = `${provider}:${revision}`;
		if (this.current?.version === version) {
			return "ok";
		}
		await this.close();
		try {
			const { createTransport } = await loadProviders();
			const transport = await withTimeout(
				(async () => {
					const created = await createTransport(provider, uri, this.report);
					await created.consume(this.runner);
					return created;
				})(),
				ENQUEUE_TIMEOUT_MS,
			);
			this.current = { version, transport };
			return "ok";
		} catch (error) {
			this.report(error instanceof Error ? error : new Error(String(error)));
			await this.close();
			return "load";
		}
	}

	/** Puts one job on the open queue. `enqueue` means the broker refused it. */
	async enqueue(jobId: string): Promise<"ok" | "enqueue"> {
		const transport = this.current?.transport;
		if (!transport) {
			return "enqueue";
		}
		try {
			await withTimeout(transport.enqueue(jobId), ENQUEUE_TIMEOUT_MS);
			return "ok";
		} catch (error) {
			this.report(error instanceof Error ? error : new Error(String(error)));
			return "enqueue";
		}
	}

	async close(): Promise<void> {
		const current = this.current;
		this.current = undefined;
		if (!current) {
			return;
		}
		try {
			await current.transport.close();
		} catch (error) {
			this.report(error instanceof Error ? error : new Error(String(error)));
		}
	}
}
