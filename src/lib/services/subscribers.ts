import { createId, createSecret } from "../crypto";
import {
	emailSubscriberSchema,
	smsSubscriberSchema,
	subscribeSchema,
	webhookSubscriberSchema,
} from "../domain/schemas";
import type { Actor, Subscriber, SubscriberType } from "../domain/types";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { iso, parse, requirePermission, type ServiceContext } from "./context";
import type { NotificationSettingsService } from "./notification-settings";
import type { SettingsService } from "./settings";

export type SubscribeOutcome = "confirmation_sent" | "already_subscribed";

/** The order of the channels on the public subscribe page. */
const PUBLIC_CHANNELS: readonly SubscriberType[] = ["email", "sms", "webhook"];

export class SubscriberService {
	private readonly ctx: ServiceContext;
	private readonly settings: SettingsService;
	private readonly notificationSettings: NotificationSettingsService;

	constructor(
		ctx: ServiceContext,
		settings: SettingsService,
		notificationSettings: NotificationSettingsService,
	) {
		this.ctx = ctx;
		this.settings = settings;
		this.notificationSettings = notificationSettings;
	}

	/**
	 * The channels that the public subscribe page offers: each channel that
	 * can send, when the settings allow subscriptions.
	 */
	async channels(): Promise<SubscriberType[]> {
		const [settings, available] = await Promise.all([
			this.settings.get(),
			this.notificationSettings.availability(),
		]);
		return settings.allowSubscriptions
			? PUBLIC_CHANNELS.filter((type) => available[type])
			: [];
	}

	/** Whether the public status page can offer subscriptions. */
	async canSubscribe(): Promise<boolean> {
		return (await this.channels()).length > 0;
	}

	/**
	 * Public double opt-in subscription through one of `channels()`. The
	 * channel sends a confirmation link. Notifications start only after a
	 * click on that link.
	 */
	async subscribe(input: {
		type: string;
		target: string;
	}): Promise<SubscribeOutcome> {
		const { type, target } = parse(subscribeSchema, input);
		if (!(await this.channels()).includes(type)) {
			throw new ForbiddenError("Subscriptions are not enabled");
		}
		const existing = await this.findByTarget(target);
		if (existing?.confirmed) {
			return "already_subscribed";
		}
		const subscriber = existing ?? (await this.insert(type, target, false));
		const [settings, channels] = await Promise.all([
			this.settings.get(),
			this.notificationSettings.resolve(),
		]);
		const sent = await this.ctx.notifier.sendConfirmation(
			subscriber,
			settings,
			channels[subscriber.type],
		);
		if (!sent) {
			throw new AppError(
				"unavailable",
				"We couldn't send the confirmation. Please try again later.",
			);
		}
		return "confirmation_sent";
	}

	async confirm(token: string): Promise<Subscriber | undefined> {
		const subscriber = await this.findByToken(token);
		if (!subscriber) {
			return undefined;
		}
		if (subscriber.confirmed) {
			return subscriber;
		}
		const next: Subscriber = {
			...subscriber,
			confirmed: true,
			confirmedAt: iso(this.ctx.now()),
		};
		await this.ctx.store.update("subscribers", next);
		return next;
	}

	async unsubscribe(token: string): Promise<boolean> {
		const subscriber = await this.findByToken(token);
		return subscriber
			? this.ctx.store.delete("subscribers", subscriber.id)
			: false;
	}

	async list(actor: Actor): Promise<Omit<Subscriber, "token">[]> {
		requirePermission(actor, "subscribers.read");
		const subscribers = await this.ctx.store.find("subscribers", {
			sort: [{ field: "createdAt", direction: "desc" }],
		});
		return subscribers.map(({ token: _token, ...subscriber }) => subscriber);
	}

	/** Every subscriber that should receive notifications. */
	async recipients(): Promise<Subscriber[]> {
		return this.ctx.store.find("subscribers", {
			where: [{ field: "confirmed", op: "eq", value: true }],
		});
	}

	async addWebhook(actor: Actor, input: { url: string }): Promise<Subscriber> {
		requirePermission(actor, "subscribers.manage");
		const { url } = parse(webhookSubscriberSchema, input);
		return this.insert("webhook", url, true);
	}

	/** Adds a pre-confirmed phone number for text messages (admins only). */
	async addSms(actor: Actor, input: { phone: string }): Promise<Subscriber> {
		requirePermission(actor, "subscribers.manage");
		const { phone } = parse(smsSubscriberSchema, input);
		return this.insert("sms", phone, true);
	}

	/** Adds a pre-confirmed email subscriber (admins only, no opt-in email). */
	async addEmail(actor: Actor, input: { email: string }): Promise<Subscriber> {
		requirePermission(actor, "subscribers.manage");
		const { email } = parse(emailSubscriberSchema, input);
		return this.insert("email", email, true);
	}

	async remove(actor: Actor, id: string): Promise<void> {
		requirePermission(actor, "subscribers.manage");
		if (!(await this.ctx.store.delete("subscribers", id))) {
			throw new NotFoundError("Subscriber", id);
		}
	}

	private async insert(
		type: SubscriberType,
		target: string,
		confirmed: boolean,
	): Promise<Subscriber> {
		const now = iso(this.ctx.now());
		return this.ctx.store.insert("subscribers", {
			id: createId("sub"),
			type,
			target,
			confirmed,
			token: createSecret(24),
			createdAt: now,
			...(confirmed ? { confirmedAt: now } : {}),
		});
	}

	private async findByTarget(target: string) {
		const [subscriber] = await this.ctx.store.find("subscribers", {
			where: [{ field: "target", op: "eq", value: target }],
			limit: 1,
		});
		return subscriber;
	}

	private async findByToken(token: string) {
		if (!token) {
			return undefined;
		}
		const [subscriber] = await this.ctx.store.find("subscribers", {
			where: [{ field: "token", op: "eq", value: token }],
			limit: 1,
		});
		return subscriber;
	}
}
