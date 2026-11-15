import { AirhornAws } from "@airhornjs/aws";
import {
	Airhorn,
	type AirhornProvider,
	type AirhornProviderMessage,
	type AirhornProviderSendResult,
	AirhornSendStrategy,
	AirhornSendType,
} from "airhorn";
import { isPhoneNumber } from "../domain/schemas";
import type { DeliveryStrategy, NotificationChannel } from "../domain/types";
import { errorMessage } from "../errors";
import type { DeliveryChannel, ResolvedProvider } from "./delivery";
import { SendGridProvider } from "./sendgrid";
import { TwilioProvider } from "./twilio";
import { WebhookProvider } from "./webhook";

/** The airhorn send type of each channel. */
export const SEND_TYPE: Record<NotificationChannel, AirhornSendType> = {
	webhook: AirhornSendType.Webhook,
	email: AirhornSendType.Email,
	sms: AirhornSendType.SMS,
};

const STRATEGY: Record<DeliveryStrategy, AirhornSendStrategy> = {
	active_passive: AirhornSendStrategy.FailOver,
	load_balanced: AirhornSendStrategy.RoundRobin,
};

/**
 * Wraps a provider of a channel. The airhorn name becomes the name that the
 * admin gave, so errors say which provider failed. The provider only offers
 * the send type of its channel, and its sender replaces the message sender.
 */
export class ChannelProvider implements AirhornProvider {
	readonly name: string;
	readonly capabilities: AirhornSendType[];
	private readonly inner: AirhornProvider;
	private readonly from?: string;

	constructor(
		name: string,
		type: AirhornSendType,
		inner: AirhornProvider,
		from?: string,
	) {
		this.name = name;
		this.capabilities = [type];
		this.inner = inner;
		this.from = from;
	}

	send(
		message: AirhornProviderMessage,
		options?: unknown,
	): Promise<AirhornProviderSendResult> {
		return this.inner.send(
			this.from ? { ...message, from: this.from } : message,
			options,
		);
	}
}

/**
 * Sends text messages through Amazon SNS. The airhorn AWS provider puts the
 * sender in the SNS sender ID, which takes only letters and digits. For a
 * phone number, this provider sends the origination number instead. The AWS
 * provider copies `options` into its request after its own message
 * attributes, so these attributes replace them.
 */
export class SnsProvider implements AirhornProvider {
	readonly name: string;
	readonly capabilities: AirhornSendType[];
	private readonly inner: AirhornProvider;

	constructor(inner: AirhornProvider) {
		this.name = inner.name;
		this.capabilities = inner.capabilities;
		this.inner = inner;
	}

	send(
		message: AirhornProviderMessage,
		options?: unknown,
	): Promise<AirhornProviderSendResult> {
		if (!isPhoneNumber(message.from)) {
			return this.inner.send(message, options);
		}
		const attribute = (value: string) => ({
			DataType: "String",
			StringValue: value,
		});
		return this.inner.send(message, {
			MessageAttributes: {
				"AWS.SNS.SMS.SMSType": attribute("Transactional"),
				"AWS.MM.SMS.OriginationNumber": attribute(message.from),
			},
		});
	}
}

function awsCredentials(provider: ResolvedProvider) {
	return {
		region: provider.options.region as string,
		accessKeyId: provider.options.accessKeyId,
		secretAccessKey: provider.secrets.secretAccessKey,
	};
}

/** Builds the airhorn provider for a provider config. */
export function createProvider(provider: ResolvedProvider): AirhornProvider {
	switch (provider.type) {
		case "webhook": {
			const seconds = Number(provider.options.timeoutSeconds);
			return new WebhookProvider({
				secret: provider.secrets.signingSecret,
				timeoutMs: seconds > 0 ? seconds * 1000 : undefined,
			});
		}
		case "sendgrid":
			return new SendGridProvider({
				apiKey: provider.secrets.apiKey as string,
			});
		case "ses":
			return new AirhornAws({
				...awsCredentials(provider),
				capabilities: [AirhornSendType.Email],
			});
		case "sns":
			return new SnsProvider(
				new AirhornAws({
					...awsCredentials(provider),
					capabilities: [AirhornSendType.SMS],
				}),
			);
		case "twilio":
			return new TwilioProvider({
				accountSid: provider.options.accountSid as string,
				authToken: provider.secrets.authToken as string,
			});
	}
}

/**
 * Creates the airhorn instance of a channel. Each channel has its own
 * instance, so each has its own send strategy and round-robin position. A
 * provider that cannot be built is left out and reported. The render cache is
 * off: it has no size limit, and each email is different for each subscriber.
 */
export function createChannelAirhorn(
	channel: DeliveryChannel,
	onError: (error: Error) => void,
): Airhorn {
	const type = SEND_TYPE[channel.channel];
	const providers = channel.providers.flatMap((provider) => {
		try {
			return [
				new ChannelProvider(
					provider.name,
					type,
					createProvider(provider),
					provider.from,
				),
			];
		} catch (error) {
			onError(
				new Error(
					`Cannot use provider "${provider.name}": ${errorMessage(error)}`,
				),
			);
			return [];
		}
	});
	return new Airhorn({
		providers,
		cache: false,
		useWebhookProvider: false,
		sendStrategy: STRATEGY[channel.strategy],
	});
}
