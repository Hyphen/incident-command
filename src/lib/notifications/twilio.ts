import {
	type AirhornProvider,
	type AirhornProviderMessage,
	type AirhornProviderSendResult,
	AirhornSendType,
} from "airhorn";
import { errorMessage } from "../errors";

export const TWILIO_API = "https://api.twilio.com/2010-04-01";

export interface TwilioProviderOptions {
	accountSid: string;
	authToken: string;
}

function failure(error: Error, response: unknown): AirhornProviderSendResult {
	return { success: false, response, errors: [error] };
}

/**
 * Airhorn text message provider for the Twilio Messages API. The
 * `@airhornjs/twilio` package cannot load in Node, because it imports a named
 * export that the CommonJS `twilio` package does not declare.
 */
export class TwilioProvider implements AirhornProvider {
	readonly name = "twilio";
	readonly capabilities = [AirhornSendType.SMS];
	private readonly options: TwilioProviderOptions;

	constructor(options: TwilioProviderOptions) {
		this.options = options;
	}

	async send(
		message: AirhornProviderMessage,
	): Promise<AirhornProviderSendResult> {
		if (!message.from) {
			return failure(new Error("Twilio needs a from number"), null);
		}
		const { accountSid, authToken } = this.options;
		try {
			const response = await fetch(
				`${TWILIO_API}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
				{
					method: "POST",
					headers: {
						authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
						"content-type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						To: message.to,
						From: message.from,
						Body: message.content,
					}),
					signal: AbortSignal.timeout(10_000),
				},
			);
			// Twilio answers with JSON. A proxy in between can answer with HTML.
			const body = (await response.json().catch(() => ({}))) as {
				sid?: string;
				message?: string;
			};
			if (!response.ok) {
				const reason = body.message ? `: ${body.message}` : "";
				return failure(
					new Error(`Twilio responded with status ${response.status}${reason}`),
					{ status: response.status, body },
				);
			}
			return {
				success: true,
				response: { status: response.status, sid: body.sid },
				errors: [],
			};
		} catch (error) {
			return failure(new Error(errorMessage(error)), {
				error: errorMessage(error),
			});
		}
	}
}
