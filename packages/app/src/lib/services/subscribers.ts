import { createId, createSecret } from "../crypto";
import { subscriberServicesSchema, subscribeSchema } from "../domain/schemas";
import type {
	Actor,
	Service,
	Subscriber,
	SubscriberType,
} from "../domain/types";
import {
	AppError,
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../errors";
import { iso, parse, requirePermission, type ServiceContext } from "./context";
import type { NotificationSettingsService } from "./notification-settings";
import type { SettingsService } from "./settings";

export type SubscribeOutcome = "confirmation_sent" | "already_subscribed";

/** The order of the channels on the public subscribe page. */
const PUBLIC_CHANNELS: readonly SubscriberType[] = ["email", "sms", "webhook"];

/** True when this subscriber should get a notice for these affected services. */
function hearsAbout(
	subscriber: Subscriber,
	affectedServiceIds: readonly string[],
): boolean {
	if (!subscriber.serviceIds) {
		return true;
	}
	return subscriber.serviceIds.some((id) => affectedServiceIds.includes(id));
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

	/** The channels that the public subscribe page offers: each channel that can send. */
	async channels(): Promise<SubscriberType[]> {
		const available = await this.notificationSettings.availability();
		return PUBLIC_CHANNELS.filter((type) => available[type]);
	}

	/** Whether the public status page can offer subscriptions. */
	async canSubscribe(): Promise<boolean> {
		return (await this.channels()).length > 0;
	}

	/**
	 * Public double opt-in subscription through one of `channels()`. The
	 * channel sends a confirmation link. Notifications start only after a
	 * click on that link. `serviceIds` limits the notices. An empty list
	 * sends a notice for every service.
	 */
	async subscribe(input: {
		type: string;
		target: string;
		serviceIds?: string[];
	}): Promise<SubscribeOutcome> {
		const { type, target, serviceIds } = parse(subscribeSchema, input);
		if (!(await this.channels()).includes(type)) {
			throw new ForbiddenError("Subscriptions are not enabled");
		}
		const existing = await this.findByTarget(target);
		if (existing?.confirmed) {
			return "already_subscribed";
		}
		const chosen =
			serviceIds === undefined
				? undefined
				: await this.validatedServices(serviceIds, { visibleOnly: true });
		const subscriber = existing
			? chosen === undefined
				? existing
				: await this.writeServices(existing, chosen)
			: await this.insert(type, target, false, chosen);
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

	/**
	 * Removes the subscriber of an address, as a visitor enters it on the
	 * public unsubscribe page. The result is the same when the address has no
	 * subscription, so the page does not show who subscribes.
	 */
	async unsubscribeAddress(input: {
		type: string;
		target: string;
	}): Promise<void> {
		const { target } = parse(subscribeSchema, input);
		const subscriber = await this.findByTarget(target);
		if (subscriber) {
			await this.ctx.store.delete("subscribers", subscriber.id);
		}
	}

	/** The subscriber for a confirmation token, without the token. */
	async own(token: string): Promise<Omit<Subscriber, "token"> | undefined> {
		const subscriber = await this.findByToken(token);
		return subscriber ? this.publicView(subscriber) : undefined;
	}

	/**
	 * Sets the services for the subscriber of this token. A hidden service
	 * that is already chosen stays. The visitor cannot add a hidden service.
	 */
	async updateOwnServices(
		token: string,
		serviceIds: string[],
	): Promise<boolean> {
		const data = parse(subscriberServicesSchema, { serviceIds });
		const subscriber = await this.findByToken(token);
		if (!subscriber) {
			return false;
		}
		const chosen = await this.validatedServices(data.serviceIds, {
			visibleOnly: true,
		});
		const services = await this.loadServices();
		const visible = new Set(
			services
				.filter((service) => !service.hidden)
				.map((service) => service.id),
		);
		const kept = (subscriber.serviceIds ?? []).filter((id) => !visible.has(id));
		await this.writeServices(subscriber, [...chosen, ...kept]);
		return true;
	}

	async list(actor: Actor): Promise<Omit<Subscriber, "token">[]> {
		requirePermission(actor, "subscribers.read");
		const subscribers = await this.ctx.store.find("subscribers", {
			sort: [{ field: "createdAt", direction: "desc" }],
		});
		return subscribers.map((subscriber) => this.publicView(subscriber));
	}

	/**
	 * Confirmed subscribers who should get a notice for an incident that
	 * affects `affectedServiceIds`. A subscriber with no services gets every
	 * notice.
	 */
	async recipients(
		affectedServiceIds: readonly string[],
	): Promise<Subscriber[]> {
		const subscribers = await this.ctx.store.find("subscribers", {
			where: [{ field: "confirmed", op: "eq", value: true }],
		});
		return subscribers.filter((subscriber) =>
			hearsAbout(subscriber, affectedServiceIds),
		);
	}

	/** Adds a confirmed subscriber. An empty `serviceIds` list means every service. */
	async add(actor: Actor, input: unknown): Promise<Subscriber> {
		requirePermission(actor, "subscribers.manage");
		const data = parse(subscribeSchema, input);
		return this.insert(
			data.type,
			data.target,
			true,
			await this.optionalServices(data.serviceIds),
		);
	}

	async addWebhook(
		actor: Actor,
		input: { url: string; serviceIds?: string[] },
	): Promise<Subscriber> {
		return this.add(actor, {
			type: "webhook",
			target: input.url,
			serviceIds: input.serviceIds,
		});
	}

	/** Adds a pre-confirmed phone number for text messages (admins only). */
	async addSms(
		actor: Actor,
		input: { phone: string; serviceIds?: string[] },
	): Promise<Subscriber> {
		return this.add(actor, {
			type: "sms",
			target: input.phone,
			serviceIds: input.serviceIds,
		});
	}

	/** Adds a pre-confirmed email subscriber (admins only, no opt-in email). */
	async addEmail(
		actor: Actor,
		input: { email: string; serviceIds?: string[] },
	): Promise<Subscriber> {
		return this.add(actor, {
			type: "email",
			target: input.email,
			serviceIds: input.serviceIds,
		});
	}

	/** Replaces the services that notify this subscriber. An empty list means every service. */
	async setServices(
		actor: Actor,
		id: string,
		input: unknown,
	): Promise<Omit<Subscriber, "token">> {
		requirePermission(actor, "subscribers.manage");
		const data = parse(subscriberServicesSchema, input);
		const subscriber = await this.ctx.store.get("subscribers", id, {
			consistent: true,
		});
		if (!subscriber) {
			throw new NotFoundError("Subscriber", id);
		}
		const next = await this.writeServices(
			subscriber,
			await this.validatedServices(data.serviceIds),
		);
		return this.publicView(next);
	}

	async remove(actor: Actor, id: string): Promise<void> {
		requirePermission(actor, "subscribers.manage");
		if (!(await this.ctx.store.delete("subscribers", id))) {
			throw new NotFoundError("Subscriber", id);
		}
	}

	/** Drops a deleted service from every subscriber. No services then means every service. */
	async forgetService(id: string): Promise<void> {
		const subscribers = await this.ctx.store.find("subscribers", undefined, {
			consistent: true,
		});
		for (const subscriber of subscribers) {
			if (!subscriber.serviceIds?.includes(id)) {
				continue;
			}
			await this.writeServices(
				subscriber,
				subscriber.serviceIds.filter((serviceId) => serviceId !== id),
			);
		}
	}

	private async optionalServices(
		ids: string[] | undefined,
	): Promise<string[] | undefined> {
		if (ids === undefined) {
			return undefined;
		}
		return this.validatedServices(ids);
	}

	/**
	 * Checks that each id is a service. With `visibleOnly`, a hidden service
	 * is rejected with the same message as an unknown service.
	 */
	private async validatedServices(
		ids: readonly string[],
		options: { visibleOnly?: boolean } = {},
	): Promise<string[]> {
		if (ids.length === 0) {
			return [];
		}
		const services = await this.loadServices();
		const allowed = new Set(
			services
				.filter((service) => options.visibleOnly !== true || !service.hidden)
				.map((service) => service.id),
		);
		for (const id of ids) {
			if (!allowed.has(id)) {
				throw new ValidationError(`Service "${id}" was not found`);
			}
		}
		return [...ids];
	}

	private async loadServices(): Promise<Service[]> {
		return this.ctx.store.find("services", undefined, { consistent: true });
	}

	private async writeServices(
		subscriber: Subscriber,
		serviceIds: string[],
	): Promise<Subscriber> {
		const next: Subscriber = { ...subscriber };
		if (serviceIds.length === 0) {
			delete next.serviceIds;
		} else {
			next.serviceIds = serviceIds;
		}
		await this.ctx.store.update("subscribers", next);
		return next;
	}

	private async insert(
		type: SubscriberType,
		target: string,
		confirmed: boolean,
		serviceIds?: string[],
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
			...(serviceIds && serviceIds.length > 0 ? { serviceIds } : {}),
		});
	}

	private publicView(subscriber: Subscriber): Omit<Subscriber, "token"> {
		const { token: _token, ...rest } = subscriber;
		return rest;
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
