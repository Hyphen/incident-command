import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "@/lib/errors";
import { ADMIN, createTestContext, EDITOR, type TestContext } from "../helpers";

describe("SubscriberService", () => {
	let t: TestContext;
	beforeEach(() => {
		t = createTestContext();
	});

	it("runs the double opt-in flow", async () => {
		await expect(t.services.subscribers.canSubscribe()).resolves.toBe(true);
		await expect(
			t.services.subscribers.subscribe({
				type: "email",
				target: "Jane@Example.com",
			}),
		).resolves.toBe("confirmation_sent");
		const pending = t.notifier.confirmations[0]?.subscriber;
		expect(pending).toMatchObject({
			target: "jane@example.com",
			confirmed: false,
			type: "email",
		});
		// The confirmation goes through the email channel of the current settings.
		expect(t.notifier.confirmations[0]?.channel).toMatchObject({
			channel: "email",
			enabled: true,
			providers: [{ type: "sendgrid", from: "status@test.dev" }],
		});
		await expect(t.services.subscribers.recipients()).resolves.toEqual([]);

		// re-subscribing before confirming resends without duplicating
		await t.services.subscribers.subscribe({
			type: "email",
			target: "jane@example.com",
		});
		expect(t.notifier.confirmations).toHaveLength(2);
		expect(await t.store.count("subscribers")).toBe(1);

		const confirmed = await t.services.subscribers.confirm(
			pending?.token ?? "",
		);
		expect(confirmed).toMatchObject({
			confirmed: true,
			confirmedAt: "2026-11-02T12:00:00.000Z",
		});
		await expect(
			t.services.subscribers.confirm(pending?.token ?? ""),
		).resolves.toMatchObject({ confirmed: true });
		await expect(t.services.subscribers.recipients()).resolves.toHaveLength(1);
		await expect(
			t.services.subscribers.subscribe({
				type: "email",
				target: "jane@example.com",
			}),
		).resolves.toBe("already_subscribed");

		await expect(
			t.services.subscribers.unsubscribe(pending?.token ?? ""),
		).resolves.toBe(true);
		await expect(
			t.services.subscribers.unsubscribe(pending?.token ?? ""),
		).resolves.toBe(false);
	});

	it("rejects bad tokens and invalid emails", async () => {
		await expect(
			t.services.subscribers.confirm("nope"),
		).resolves.toBeUndefined();
		await expect(t.services.subscribers.confirm("")).resolves.toBeUndefined();
		await expect(
			t.services.subscribers.subscribe({
				type: "email",
				target: "not-an-email",
			}),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.subscribers.subscribe({ type: "webhook", target: "ftp://x" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.subscribers.subscribe({ type: "fax", target: "+15551234567" }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("offers each channel that can send and refuses the others", async () => {
		// Text messaging has no provider in the test environment.
		await expect(t.services.subscribers.channels()).resolves.toEqual([
			"email",
			"webhook",
		]);
		await expect(
			t.services.subscribers.subscribe({ type: "sms", target: "+15551234567" }),
		).rejects.toBeInstanceOf(ForbiddenError);

		await t.services.notificationSettings.updateChannel(ADMIN, "email", {
			enabled: false,
		});
		await expect(t.services.subscribers.channels()).resolves.toEqual([
			"webhook",
		]);
		await expect(
			t.services.subscribers.subscribe({ type: "email", target: "a@b.co" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(t.services.subscribers.canSubscribe()).resolves.toBe(true);

		await t.services.settings.update(ADMIN, { allowSubscriptions: false });
		await expect(t.services.subscribers.channels()).resolves.toEqual([]);
		await expect(t.services.subscribers.canSubscribe()).resolves.toBe(false);
		await expect(
			t.services.subscribers.subscribe({
				type: "webhook",
				target: "https://hooks.example.com/a",
			}),
		).rejects.toBeInstanceOf(ForbiddenError);
		expect(await t.store.count("subscribers")).toBe(0);
	});

	it("confirms a phone number or a webhook through its own channel", async () => {
		await t.services.notificationSettings.updateChannel(ADMIN, "sms", {
			from: "ACME",
		});
		await t.services.notificationSettings.addProvider(ADMIN, "sms", {
			type: "sns",
			name: "SNS",
			values: { region: "us-east-1" },
		});
		await expect(
			t.services.subscribers.subscribe({
				type: "sms",
				target: "+1 (555) 123-4567",
			}),
		).resolves.toBe("confirmation_sent");
		await expect(
			t.services.subscribers.subscribe({
				type: "webhook",
				target: "https://hooks.example.com/a",
			}),
		).resolves.toBe("confirmation_sent");
		expect(
			t.notifier.confirmations.map(({ subscriber, channel }) => [
				subscriber.type,
				subscriber.target,
				subscriber.confirmed,
				channel.channel,
			]),
		).toEqual([
			["sms", "+15551234567", false, "sms"],
			["webhook", "https://hooks.example.com/a", false, "webhook"],
		]);
		await expect(t.services.subscribers.recipients()).resolves.toEqual([]);
		for (const { subscriber } of t.notifier.confirmations) {
			await t.services.subscribers.confirm(subscriber.token);
		}
		await expect(t.services.subscribers.recipients()).resolves.toHaveLength(2);
	});

	it("lets admins manage webhook and email subscribers", async () => {
		const hook = await t.services.subscribers.addWebhook(ADMIN, {
			url: "https://hooks.slack.com/services/x",
		});
		expect(hook).toMatchObject({
			type: "webhook",
			confirmed: true,
			confirmedAt: "2026-11-02T12:00:00.000Z",
		});
		t.clock.advance(1000);
		const email = await t.services.subscribers.addEmail(ADMIN, {
			email: "ops@acme.dev",
		});
		expect(email.confirmed).toBe(true);
		const listed = await t.services.subscribers.list(ADMIN);
		expect(listed.map((subscriber) => subscriber.id)).toEqual([
			email.id,
			hook.id,
		]);
		expect(listed[0]).not.toHaveProperty("token");
		await expect(
			t.services.subscribers.addEmail(ADMIN, { email: "ops@acme.dev" }),
		).rejects.toBeInstanceOf(ConflictError);
		await t.services.subscribers.remove(ADMIN, hook.id);
		await expect(
			t.services.subscribers.remove(ADMIN, hook.id),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.subscribers.addWebhook(ADMIN, { url: "ftp://x" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(t.services.subscribers.list(EDITOR)).rejects.toBeInstanceOf(
			ForbiddenError,
		);
	});

	it("lets admins add phone numbers for text messages", async () => {
		const phone = await t.services.subscribers.addSms(ADMIN, {
			phone: "+1 (555) 123-4567",
		});
		expect(phone).toMatchObject({
			type: "sms",
			target: "+15551234567",
			confirmed: true,
		});
		await expect(
			t.services.subscribers.addSms(ADMIN, { phone: "555-1234" }),
		).rejects.toThrow(/E\.164/);
		await expect(
			t.services.subscribers.addSms(EDITOR, { phone: "+15551234567" }),
		).rejects.toBeInstanceOf(ForbiddenError);
	});
});
