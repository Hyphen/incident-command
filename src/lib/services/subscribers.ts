import { createId, createSecret } from "../crypto";
import {
	emailSubscriberSchema,
	smsSubscriberSchema,
	subscribeSchema,
	webhookSubscriberSchema,
} from "../domain/schemas";
import type {
	Actor,
	Incident,
	Subscriber,
	SubscriberType,
} from "../domain/types";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { iso, parse, requirePermission, type ServiceContext } from "./context";
import type { NotificationSettingsService } from "./notification-settings";
import type { SettingsService } from "./settings";

export type SubscribeOutcome = "confirmation_sent" | "already_subscribed";

/**
 * Returns true when a subscriber gets the notifications of an incident.
 * Without `incidentId`, it returns true only for a subscriber of all notifications.
 */
function receives(subscriber: Subscriber, incidentId?: string): boolean {
	return (
		!subscriber.incidentIds ||
		(incidentId !== undefined && subscriber.incidentIds.includes(incidentId))
	);
}

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

	/** Whether the public status page can offer email subscriptions. */
	async canSubscribe(): Promise<boolean> {
		const [settings, available] = await Promise.all([
			this.settings.get(),
			this.notificationSettings.availability(),
		]);
		return settings.allowSubscriptions && available.email;
	}

	/**
	 * Public double opt-in email subscription. With `incidentId`, the
	 * subscription is for that incident only. The link in the confirmation
	 * email holds the incident, so a confirmed subscriber keeps the current
	 * notifications until the subscriber confirms the new request.
	 */
	async subscribe(input: {
		email: string;
		incidentId?: string;
	}): Promise<SubscribeOutcome> {
		if (!(await this.canSubscribe())) {
			throw new ForbiddenError("Subscriptions are not enabled");
		}
		const { email, incidentId } = parse(subscribeSchema, input);
		const incident = incidentId ? await this.incident(incidentId) : undefined;
		const existing = await this.findByTarget(email);
		if (existing?.confirmed && receives(existing, incidentId)) {
			return "already_subscribed";
		}
		const subscriber = existing ?? (await this.insert("email", email, false));
		const [settings, channels] = await Promise.all([
			this.settings.get(),
			this.notificationSettings.resolve(),
		]);
		const sent = await this.ctx.notifier.sendConfirmation(
			subscriber,
			settings,
			channels.email,
			incident && { id: incident.id, title: incident.title },
		);
		if (!sent) {
			throw new AppError(
				"unavailable",
				"We couldn't send the confirmation email. Please try again later.",
			);
		}
		return "confirmation_sent";
	}

	/**
	 * Confirms the link of a confirmation email. A link without an incident
	 * gives all notifications. A link with an incident adds that incident,
	 * unless the subscriber already gets all notifications. A confirmation
	 * never removes notifications. Resolves `undefined` for an unknown token
	 * or incident.
	 */
	async confirm(
		token: string,
		incidentId?: string,
	): Promise<Subscriber | undefined> {
		const subscriber = await this.findByToken(token);
		if (
			!subscriber ||
			(incidentId && !(await this.ctx.store.get("incidents", incidentId)))
		) {
			return undefined;
		}
		let incidentIds: string[] | undefined;
		if (incidentId) {
			incidentIds = subscriber.confirmed
				? subscriber.incidentIds && [
						...new Set([...subscriber.incidentIds, incidentId]),
					]
				: [incidentId];
		}
		// The new list contains the old list, so the same length means no change.
		if (
			subscriber.confirmed &&
			incidentIds?.length === subscriber.incidentIds?.length
		) {
			return subscriber;
		}
		const { incidentIds: _previous, ...rest } = subscriber;
		const next: Subscriber = {
			...rest,
			confirmed: true,
			confirmedAt: subscriber.confirmedAt ?? iso(this.ctx.now()),
			...(incidentIds ? { incidentIds } : {}),
		};
		await this.ctx.store.update("subscribers", next);
		return next;
	}

	/**
	 * Stops notifications. With `incidentId`, a subscriber of more than one
	 * incident keeps the other incidents. In all other cases, this method
	 * removes the subscriber.
	 */
	async unsubscribe(token: string, incidentId?: string): Promise<boolean> {
		const subscriber = await this.findByToken(token);
		if (!subscriber) {
			return false;
		}
		const incidentIds = incidentId
			? subscriber.incidentIds?.filter((id) => id !== incidentId)
			: undefined;
		if (incidentIds?.length) {
			await this.ctx.store.update("subscribers", {
				...subscriber,
				incidentIds,
			});
			return true;
		}
		return this.ctx.store.delete("subscribers", subscriber.id);
	}

	async list(actor: Actor): Promise<Omit<Subscriber, "token">[]> {
		requirePermission(actor, "subscribers.read");
		const subscribers = await this.ctx.store.find("subscribers", {
			sort: [{ field: "createdAt", direction: "desc" }],
		});
		return subscribers.map(({ token: _token, ...subscriber }) => subscriber);
	}

	/** Every subscriber that gets the notifications of an incident. */
	async recipients(incidentId: string): Promise<Subscriber[]> {
		const subscribers = await this.ctx.store.find("subscribers", {
			where: [{ field: "confirmed", op: "eq", value: true }],
		});
		return subscribers.filter((subscriber) => receives(subscriber, incidentId));
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

	private async incident(id: string): Promise<Incident> {
		const incident = await this.ctx.store.get("incidents", id);
		if (!incident) {
			throw new NotFoundError("Incident", id);
		}
		return incident;
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
