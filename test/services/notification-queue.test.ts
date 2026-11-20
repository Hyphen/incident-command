import { permissionsForRole } from "@/lib/domain/permissions";
import {
	ConflictError,
	PermissionDeniedError,
	ValidationError,
} from "@/lib/errors";
import { NotificationQueue } from "@/lib/notifications/queue";
import { EncryptionKeyMissingError, SecretBox } from "@/lib/secrets";
import {
	NOTIFICATION_QUEUE_CHANGED,
	QUEUE_URI_INVALID,
} from "@/lib/services/notification-queue";
import {
	ADMIN,
	agentActor,
	createTestContext,
	EDITOR,
	VIEWER,
} from "../helpers";

const KEY = "k".repeat(32);
const REDIS = "redis://user:secret@localhost:6379/0";

function context(env?: Record<string, string>) {
	return createTestContext({ env });
}

describe("NotificationQueueService", () => {
	it("saves one provider and keeps the URI encrypted", async () => {
		const t = context({ ENCRYPTION_KEY: KEY });
		await expect(t.services.notificationQueue.provider()).resolves.toBe(
			undefined,
		);
		const first = await t.services.notificationQueue.update(ADMIN, {
			revision: 0,
			provider: "redis",
			uri: REDIS,
		});
		expect(first.ready).toBe(false);
		expect(first.settings).toEqual({
			provider: "redis",
			hasUri: true,
			revision: 1,
		});
		const stored = await t.store.get("notification_queue", "queue");
		expect(stored?.uri).toBeDefined();
		expect(stored?.uri).not.toContain("secret");
		expect(JSON.stringify(first.settings)).not.toContain("secret");

		const kept = await t.services.notificationQueue.update(ADMIN, {
			revision: 1,
			provider: "redis",
			uri: "  ",
		});
		expect(kept.settings).toMatchObject({ hasUri: true, revision: 2 });
		const rotated = await t.store.get("notification_queue", "queue");
		expect(rotated?.uri).toBe(stored?.uri);
		expect(rotated?.uri).not.toContain("secret");

		const cleared = await t.services.notificationQueue.update(ADMIN, {
			revision: 2,
			provider: "memory",
		});
		expect(cleared.settings).toEqual({
			provider: "memory",
			hasUri: false,
			revision: 3,
		});
		expect(
			(await t.store.get("notification_queue", "queue"))?.uri,
		).toBeUndefined();
	});

	it("drops the URI when the provider changes and rejects a bad URI", async () => {
		const t = context({ ENCRYPTION_KEY: KEY });
		await t.services.notificationQueue.update(ADMIN, {
			revision: 0,
			provider: "redis",
			uri: "redis://localhost:6379",
		});
		const next = await t.services.notificationQueue.update(ADMIN, {
			revision: 1,
			provider: "rabbitmq",
		});
		expect(next.settings).toEqual({
			provider: "rabbitmq",
			hasUri: false,
			revision: 2,
		});
		await expect(
			t.services.notificationQueue.update(ADMIN, {
				revision: 2,
				provider: "redis",
				uri: "http://localhost",
			}),
		).rejects.toThrow(new ValidationError(QUEUE_URI_INVALID));
		await expect(
			t.services.notificationQueue.update(ADMIN, {
				revision: 2,
				provider: "rabbitmq",
				uri: "http://localhost",
			}),
		).rejects.toThrow(new ValidationError(QUEUE_URI_INVALID));
		await expect(
			t.services.notificationQueue.update(ADMIN, {
				revision: 2,
				provider: "nats",
				uri: "bad uri",
			}),
		).rejects.toThrow(new ValidationError(QUEUE_URI_INVALID));
		await expect(
			t.services.notificationQueue.update(ADMIN, {
				revision: 2,
				provider: "zeromq",
				uri: "http://localhost",
			}),
		).rejects.toThrow(new ValidationError(QUEUE_URI_INVALID));
		await expect(
			t.services.notificationQueue.update(ADMIN, {
				revision: 2,
				provider: "memory",
				uri: "redis://localhost:6379",
			}),
		).rejects.toThrow(new ValidationError(QUEUE_URI_INVALID));
	});

	it("rejects a stale revision and a second save of the same revision", async () => {
		const t = context({ ENCRYPTION_KEY: KEY });
		await t.services.notificationQueue.update(ADMIN, {
			revision: 0,
			provider: "memory",
		});
		await expect(
			t.services.notificationQueue.update(ADMIN, {
				revision: 0,
				provider: "memory",
			}),
		).rejects.toThrow(new ConflictError(NOTIFICATION_QUEUE_CHANGED));
		const [first, second] = await Promise.allSettled([
			t.services.notificationQueue.update(ADMIN, {
				revision: 1,
				provider: "redis",
				uri: "redis://localhost:6379",
			}),
			t.services.notificationQueue.update(ADMIN, {
				revision: 1,
				provider: "nats",
				uri: "localhost:4222",
			}),
		]);
		const rejected = [first, second].filter(
			(item) => item.status === "rejected",
		);
		expect(rejected).toHaveLength(1);
		expect((await t.store.get("notification_queue", "queue"))?.revision).toBe(
			2,
		);
	});

	it("refuses a URI when the server has no encryption key", async () => {
		const t = context();
		await expect(
			t.services.notificationQueue.update(ADMIN, {
				revision: 0,
				provider: "redis",
				uri: "redis://localhost:6379",
			}),
		).rejects.toBeInstanceOf(EncryptionKeyMissingError);
		await expect(
			t.services.notificationQueue.update(ADMIN, {
				revision: 0,
				provider: "memory",
			}),
		).resolves.toMatchObject({ ready: true, settings: { provider: "memory" } });
	});

	it("lets an admin read the choice and blocks an editor and an agent from a change", async () => {
		const t = context();
		const agent = agentActor(permissionsForRole("admin"));
		await expect(
			t.services.notificationQueue.view(EDITOR),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(
			t.services.notificationQueue.view(VIEWER),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(t.services.notificationQueue.view(agent)).resolves.toEqual({
			hasUri: false,
			revision: 0,
		});
		await expect(
			t.services.notificationQueue.update(EDITOR, {
				revision: 0,
				provider: "memory",
			}),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(
			t.services.notificationQueue.update(agent, {
				revision: 0,
				provider: "memory",
			}),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(t.services.notificationQueue.provider()).resolves.toBe(
			undefined,
		);
	});

	it("sends without the queue when the saved URI cannot be read", async () => {
		const t = context({ ENCRYPTION_KEY: KEY });
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await t.store.insert("notification_queue", {
			id: "queue",
			provider: "redis",
			uri: "not-a-ciphertext",
			revision: 1,
			updatedAt: "2026-11-02T12:00:00.000Z",
		});
		await expect(t.services.notificationQueue.provider()).resolves.toBe(
			"redis",
		);
		await expect(t.services.notificationQueue.enqueue("njb_1")).resolves.toBe(
			"load",
		);
		const decrypt = vi
			.spyOn(SecretBox.prototype, "decrypt")
			.mockImplementation(() => {
				throw "bad";
			});
		await expect(t.services.notificationQueue.enqueue("njb_1")).resolves.toBe(
			"load",
		);
		expect(String(error.mock.calls.at(-1)?.[0])).toContain("bad");
		decrypt.mockRestore();
		await t.services.notificationQueue.bootstrap();
		await vi.waitFor(() => expect(error).toHaveBeenCalled());
		error.mockRestore();
	});

	it("logs a connection failure and does not throw", async () => {
		const t = context();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const open = vi
			.spyOn(NotificationQueue.prototype, "open")
			.mockRejectedValueOnce("boom")
			.mockRejectedValueOnce(new Error("boom"));
		await t.store.insert("notification_queue", {
			id: "queue",
			provider: "memory",
			revision: 1,
			updatedAt: "2026-11-02T12:00:00.000Z",
		});
		await t.services.notificationQueue.bootstrap();
		await t.services.notificationQueue.bootstrap();
		await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(2));
		expect(String(error.mock.calls[0]?.[0])).toContain("boom");
		expect(String(error.mock.calls[1]?.[0])).toContain("boom");
		open.mockRestore();
		error.mockRestore();
	});

	it("reports enqueue when no provider is saved", async () => {
		const t = context();
		await expect(t.services.notificationQueue.enqueue("njb_1")).resolves.toBe(
			"enqueue",
		);
		await t.services.notificationQueue.bootstrap();
	});

	it("clears the provider", async () => {
		const t = context();
		await t.services.notificationQueue.update(ADMIN, {
			revision: 0,
			provider: "memory",
		});
		const cleared = await t.services.notificationQueue.update(ADMIN, {
			revision: 1,
		});
		expect(cleared.settings).toEqual({ hasUri: false, revision: 2 });
		await expect(t.services.notificationQueue.provider()).resolves.toBe(
			undefined,
		);
	});
});
