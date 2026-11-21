import { MemoryMessageProvider, MemoryTaskProvider, Qified } from "qified";
import {
	createTransport,
	listen,
	messageTransport,
	QUEUE_NAME,
	strict,
	taskTransport,
} from "@/lib/notifications/queue-providers";

const built = vi.hoisted(() => {
	const items: { id: string; uri?: string }[] = [];
	const loads = { redis: 0, rabbitmq: 0, nats: 0, zeromq: 0 };
	function providerClass(id: "redis" | "rabbitmq" | "nats" | "zeromq") {
		return class {
			constructor(options?: { uri?: string }) {
				loads[id] += 1;
				items.push({ id, uri: options?.uri });
			}
		};
	}
	return { items, loads, providerClass };
});

vi.mock("@qified/redis", () => ({
	RedisTaskProvider: built.providerClass("redis"),
}));
vi.mock("@qified/rabbitmq", () => ({
	RabbitMqTaskProvider: built.providerClass("rabbitmq"),
}));
vi.mock("@qified/nats", () => ({
	NatsTaskProvider: built.providerClass("nats"),
}));
vi.mock("@qified/zeromq", () => ({
	ZmqMessageProvider: built.providerClass("zeromq"),
}));

describe("queue transports", () => {
	it("delivers a memory task again after the run throws", async () => {
		const ran: string[] = [];
		const transport = await createTransport("memory", undefined, () => {});
		await transport.consume(async (id) => {
			ran.push(id);
			if (ran.length === 1) {
				throw new Error("again");
			}
		});
		await transport.enqueue("njb_1");
		await vi.waitFor(() => expect(ran).toEqual(["njb_1", "njb_1"]), {
			timeout: 2000,
		});
		await transport.enqueue("njb_bad");
		await transport.close();
	});

	it("rejects a task whose job id is not a string", async () => {
		const provider = new MemoryTaskProvider();
		const qified = new Qified({ taskProviders: [provider] });
		let ran = false;
		const transport = taskTransport(qified, () => {});
		await transport.consume(async () => {
			ran = true;
		});
		await qified.enqueue(QUEUE_NAME, { data: { jobId: 1 } });
		await qified.enqueue(QUEUE_NAME, { data: {} });
		await qified.enqueue(QUEUE_NAME, { data: null });
		await new Promise((resolve) => setTimeout(resolve, 250));
		expect(ran).toBe(false);
		await transport.close();
	});

	it("rejects when the queue accepts no task", async () => {
		const transport = taskTransport(new Qified(), () => {});
		await expect(transport.enqueue("njb_1")).rejects.toThrow(/did not accept/);
	});

	it("removes the error listener of each queue call", async () => {
		const provider = new MemoryTaskProvider();
		const qified = new Qified({ taskProviders: [provider] });
		const transport = taskTransport(qified, () => {});
		const listeners = qified.listenerCount("error");
		await transport.consume(async () => {});
		await transport.enqueue("njb_1");
		await transport.enqueue("njb_2");
		expect(qified.listenerCount("error")).toBe(listeners);
		await provider.disconnect();
		await expect(transport.enqueue("njb_3")).rejects.toThrow(
			"TaskProvider has been disconnected",
		);
		expect(qified.listenerCount("error")).toBe(listeners);
		await transport.close();
	});

	it("delivers a message and reports a handler failure", async () => {
		const provider = new MemoryMessageProvider();
		const qified = new Qified({ messageProviders: [provider] });
		const got: string[] = [];
		const errors: Error[] = [];
		const transport = messageTransport(qified, (error) => errors.push(error));
		await transport.consume(async (id, keepAlive) => {
			await keepAlive();
			got.push(id);
			throw new Error("handler");
		});
		await transport.enqueue("njb_9");
		await qified.publish(QUEUE_NAME, { id: "msg_bad", data: { jobId: 4 } });
		await qified.publish(QUEUE_NAME, { id: "msg_empty", data: null });
		await vi.waitFor(() => expect(got).toEqual(["njb_9"]));
		await vi.waitFor(() => expect(errors[0]?.message).toBe("handler"));
		await transport.close();
	});

	it("builds only the selected broker", async () => {
		const ignore = () => {};
		await createTransport("redis", "redis://localhost:6379", ignore);
		expect(built.loads).toEqual({ redis: 1, rabbitmq: 0, nats: 0, zeromq: 0 });
		await createTransport("rabbitmq", "amqp://localhost:5672", ignore);
		await createTransport("nats", undefined, ignore);
		await createTransport("zeromq", "tcp://localhost:5555", ignore);
		expect(built.items).toEqual([
			{ id: "redis", uri: "redis://localhost:6379" },
			{ id: "rabbitmq", uri: "amqp://localhost:5672" },
			{ id: "nats", uri: undefined },
			{ id: "zeromq", uri: "tcp://localhost:5555" },
		]);
		expect(built.loads).toEqual({ redis: 1, rabbitmq: 1, nats: 1, zeromq: 1 });
	});

	it("reports an error event and ignores a source with no listener", async () => {
		const errors: Error[] = [];
		listen({ on: "nope" }, (error) => errors.push(error));
		listen({}, (error) => errors.push(error));
		let fail = (_error: unknown) => {};
		listen(
			{
				on(event: string, handler: (error: unknown) => void) {
					if (event === "error") {
						fail = handler;
					}
				},
			},
			(error) => errors.push(error),
		);
		fail("boom");
		fail(new Error("again"));
		expect(errors.map((error) => error.message)).toEqual(["boom", "again"]);

		let during = () => {};
		const source = {
			on(_event: string, handler: (error: unknown) => void) {
				during = () => handler(new Error("refused"));
			},
		};
		await expect(
			strict(source, async () => {
				during();
				return 1;
			}),
		).rejects.toThrow("refused");
		await expect(strict({}, async () => 1)).resolves.toBe(1);
		await expect(strict(source, async () => 2)).resolves.toBe(2);
	});
});
