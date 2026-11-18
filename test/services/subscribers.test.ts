import type { Incident } from "@/lib/domain/types";
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
			t.services.subscribers.subscribe({ email: "Jane@Example.com" }),
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
		await expect(t.services.subscribers.recipients("inc_1")).resolves.toEqual(
			[],
		);

		// re-subscribing before confirming resends without duplicating
		await t.services.subscribers.subscribe({ email: "jane@example.com" });
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
		await expect(
			t.services.subscribers.recipients("inc_1"),
		).resolves.toHaveLength(1);
		await expect(
			t.services.subscribers.subscribe({ email: "jane@example.com" }),
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
			t.services.subscribers.subscribe({ email: "not-an-email" }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("refuses public subscriptions when disabled or email is not configured", async () => {
		await t.services.settings.update(ADMIN, { allowSubscriptions: false });
		await expect(
			t.services.subscribers.subscribe({ email: "a@b.co" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		const noEmail = createTestContext();
		await noEmail.services.notificationSettings.updateChannel(ADMIN, "email", {
			enabled: false,
		});
		await expect(noEmail.services.subscribers.canSubscribe()).resolves.toBe(
			false,
		);
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

describe("SubscriberService incident subscriptions", () => {
	const email = "jane@example.com";
	let t: TestContext;
	let api: Incident;
	let db: Incident;
	beforeEach(async () => {
		t = createTestContext();
		api = await t.services.incidents.create(EDITOR, {
			title: "API errors",
			message: "Investigating",
		});
		db = await t.services.incidents.create(EDITOR, {
			title: "Slow database",
			message: "Investigating",
		});
	});

	/** Subscribes to one incident and confirms the link. Returns the token. */
	const subscribeTo = async (incidentId: string) => {
		await t.services.subscribers.subscribe({ email, incidentId });
		const token = t.notifier.confirmations.at(-1)?.subscriber.token ?? "";
		await t.services.subscribers.confirm(token, incidentId);
		return token;
	};

	it("sends the updates of the subscribed incident only", async () => {
		await expect(
			t.services.subscribers.subscribe({ email, incidentId: "inc_nope" }),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(await t.store.count("subscribers")).toBe(0);

		await expect(
			t.services.subscribers.subscribe({ email, incidentId: api.id }),
		).resolves.toBe("confirmation_sent");
		const [sent] = t.notifier.confirmations;
		expect(sent?.incident).toEqual({ id: api.id, title: "API errors" });
		const token = sent?.subscriber.token ?? "";
		await expect(
			t.services.subscribers.confirm(token, "inc_nope"),
		).resolves.toBeUndefined();
		await expect(
			t.services.subscribers.confirm(token, api.id),
		).resolves.toMatchObject({ confirmed: true, incidentIds: [api.id] });
		await expect(
			t.services.subscribers.subscribe({ email, incidentId: api.id }),
		).resolves.toBe("already_subscribed");

		await t.services.incidents.postUpdate(EDITOR, db.id, { message: "Slow" });
		await t.services.incidents.postUpdate(EDITOR, api.id, { message: "Fixed" });
		expect(
			t.notifier.incidents.map(({ notification, subscribers }) => [
				notification.incident.id,
				subscribers.map((subscriber) => subscriber.target),
			]),
		).toEqual([[api.id, [email]]]);
	});

	it("adds incidents or all updates only when the subscriber confirms", async () => {
		const token = await subscribeTo(api.id);
		t.clock.advance(60_000);

		// A new request changes nothing until the subscriber confirms it.
		await expect(
			t.services.subscribers.subscribe({ email, incidentId: db.id }),
		).resolves.toBe("confirmation_sent");
		await expect(t.services.subscribers.recipients(db.id)).resolves.toEqual([]);
		const both = await t.services.subscribers.confirm(token, db.id);
		expect(both?.incidentIds).toEqual([api.id, db.id]);
		expect(both?.confirmedAt).toBe("2026-11-02T12:00:00.000Z");
		const again = await t.services.subscribers.confirm(token, api.id);
		expect(again?.incidentIds).toEqual([api.id, db.id]);

		// A link for all updates removes the limit.
		await expect(t.services.subscribers.subscribe({ email })).resolves.toBe(
			"confirmation_sent",
		);
		const all = await t.services.subscribers.confirm(token);
		expect(all).not.toHaveProperty("incidentIds");
		await expect(
			t.services.subscribers.recipients("inc_other"),
		).resolves.toHaveLength(1);

		// An incident link does not limit a subscriber of all updates.
		await expect(
			t.services.subscribers.subscribe({ email, incidentId: api.id }),
		).resolves.toBe("already_subscribed");
		await expect(
			t.services.subscribers.confirm(token, api.id),
		).resolves.not.toHaveProperty("incidentIds");
	});

	it("keeps every change when changes to a subscriber run at the same time", async () => {
		const token = await subscribeTo(api.id);
		const queue = await t.services.incidents.create(EDITOR, {
			title: "Queue backlog",
			message: "Investigating",
		});
		const stored = async () =>
			(await t.store.find("subscribers"))[0]?.incidentIds?.toSorted();

		await Promise.all([
			t.services.subscribers.confirm(token, db.id),
			t.services.subscribers.confirm(token, queue.id),
		]);
		expect(await stored()).toEqual([api.id, db.id, queue.id].toSorted());

		await Promise.all([
			t.services.subscribers.unsubscribe(token, api.id),
			t.services.subscribers.unsubscribe(token, db.id),
		]);
		expect(await stored()).toEqual([queue.id]);

		// Only one of two removals at the same time removes the subscriber.
		const removed = await Promise.all([
			t.services.subscribers.unsubscribe(token),
			t.services.subscribers.unsubscribe(token),
		]);
		expect(removed.toSorted()).toEqual([false, true]);
		expect(await t.store.count("subscribers")).toBe(0);
	});

	it("gives up with a ConflictError when the subscriber keeps changing", async () => {
		const token = await subscribeTo(api.id);
		const update = vi.spyOn(t.store, "update").mockResolvedValue(undefined);
		await expect(
			t.services.subscribers.confirm(token, db.id),
		).rejects.toBeInstanceOf(ConflictError);
		expect(update).toHaveBeenCalledTimes(5);
	});

	it("unsubscribes from one incident and keeps the other incidents", async () => {
		await subscribeTo(api.id);
		const token = await subscribeTo(db.id);

		await expect(
			t.services.subscribers.unsubscribe(token, api.id),
		).resolves.toBe(true);
		await expect(t.services.subscribers.recipients(api.id)).resolves.toEqual(
			[],
		);
		await expect(
			t.services.subscribers.recipients(db.id),
		).resolves.toHaveLength(1);
		// The link of an incident that the subscriber no longer has changes nothing.
		await t.services.subscribers.unsubscribe(token, api.id);
		await expect(
			t.services.subscribers.recipients(db.id),
		).resolves.toHaveLength(1);
		await expect(
			t.services.subscribers.unsubscribe(token, db.id),
		).resolves.toBe(true);
		expect(await t.store.count("subscribers")).toBe(0);

		// The incident link of a subscriber of all updates removes the subscriber.
		const ops = await t.services.subscribers.addEmail(ADMIN, {
			email: "ops@acme.dev",
		});
		await expect(
			t.services.subscribers.unsubscribe(ops.token, api.id),
		).resolves.toBe(true);
		expect(await t.store.count("subscribers")).toBe(0);
	});
});
