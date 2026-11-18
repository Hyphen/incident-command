import type { Settings, Subscriber } from "@/lib/domain/types";
import type { DeliveryChannel } from "@/lib/notifications/delivery";
import { AirhornNotifier } from "@/lib/notifications/notifier";

// The notifier loads airhorn and the providers on the first send. Here that
// load fails, as it does when the image is broken.
vi.mock("@/lib/notifications/providers", () => {
	throw new Error("Cannot find module 'airhorn'");
});

const subscriber: Subscriber = {
	id: "sub_1",
	type: "email",
	target: "jane@example.com",
	confirmed: false,
	token: "tok",
	createdAt: "2026-01-01T00:00:00.000Z",
};

const settings: Settings = {
	id: "settings",
	siteName: "Acme Status",
	description: "",
	theme: "default",
	showPoweredBy: true,
	uptimeDays: 90,
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const email: DeliveryChannel = {
	channel: "email",
	enabled: true,
	strategy: "active_passive",
	providers: [
		{
			id: "prv_1",
			type: "sendgrid",
			name: "SendGrid",
			from: "status@acme.dev",
			options: {},
			secrets: { apiKey: "SG.key" },
		},
	],
	version: "v1",
};

it("reports the send as failed, and does not throw, when airhorn cannot load", async () => {
	const errors: Error[] = [];
	const notifier = new AirhornNotifier({
		onError: (error) => errors.push(error),
	});
	await expect(
		notifier.sendConfirmation(subscriber, settings, email),
	).resolves.toBe(false);
	expect(errors).toHaveLength(1);
	// Vitest wraps the error of the mock factory. The cause keeps the original.
	const messages = (error: unknown): string[] =>
		error instanceof Error ? [error.message, ...messages(error.cause)] : [];
	expect(messages(errors[0])).toContain("Cannot find module 'airhorn'");
});
