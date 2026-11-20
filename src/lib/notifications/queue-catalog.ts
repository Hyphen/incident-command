import type { QueueProviderId } from "../domain/types";

export interface QueueProviderDefinition {
	label: string;
	/** Task providers ack each job. Message providers do not. */
	api: "task" | "message";
	/** True when a restart keeps the tasks. */
	durable: boolean;
	hint: string;
	uri?: { default: string; pattern: string };
}

export const QUEUE_PROVIDERS: Record<QueueProviderId, QueueProviderDefinition> =
	{
		memory: {
			label: "Memory",
			api: "task",
			durable: false,
			hint: "The queue is in the memory of this server. A restart removes the tasks.",
		},
		redis: {
			label: "Redis",
			api: "task",
			durable: true,
			hint: "Redis keeps the tasks.",
			uri: { default: "redis://localhost:6379", pattern: "^rediss?://\\S+$" },
		},
		rabbitmq: {
			label: "RabbitMQ",
			api: "task",
			durable: true,
			hint: "RabbitMQ keeps the tasks.",
			uri: { default: "amqp://localhost:5672", pattern: "^amqps?://\\S+$" },
		},
		nats: {
			label: "NATS",
			api: "task",
			durable: true,
			hint: "JetStream must be on in the NATS server.",
			uri: { default: "localhost:4222", pattern: "^\\S+$" },
		},
		zeromq: {
			label: "ZeroMQ",
			api: "message",
			durable: false,
			hint: "ZeroMQ has no task queue. The server uses messages. Use it with one server instance.",
			uri: {
				default: "tcp://localhost:5555",
				pattern: "^(tcp|ipc)://\\S+$",
			},
		},
	};
