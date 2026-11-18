import {
	type AirhornProvider,
	type AirhornProviderMessage,
	type AirhornProviderSendResult,
	AirhornSendType,
} from "airhorn";
import { hmacSha256 } from "../crypto";
import { assertPublicUrl, publicDispatcher } from "./private-network";

export const SIGNATURE_HEADER = "x-incident-command-signature";

export interface WebhookProviderOptions {
	/** When set, requests carry an HMAC-SHA256 signature of the body. */
	secret?: string;
	timeoutMs?: number;
	/**
	 * Allows requests to private network addresses. An admin sets it on the
	 * webhook channel. Off by default, so a webhook URL cannot reach a host
	 * inside the network of the server.
	 */
	allowPrivateNetworks?: boolean;
	fetch?: typeof fetch;
}

/**
 * Airhorn webhook provider that posts the rendered template content as the raw
 * JSON body (Slack, Discord and generic receivers all understand the payload)
 * and optionally signs it so receivers can verify the sender.
 */
export class WebhookProvider implements AirhornProvider {
	readonly name = "incident-command-webhook";
	readonly capabilities = [AirhornSendType.Webhook];
	private readonly options: WebhookProviderOptions;

	constructor(options: WebhookProviderOptions = {}) {
		this.options = options;
	}

	async send(
		message: AirhornProviderMessage,
	): Promise<AirhornProviderSendResult> {
		const body = message.content;
		const headers: Record<string, string> = {
			"content-type": "application/json",
			"user-agent": "incident-command",
		};
		if (this.options.secret) {
			headers[SIGNATURE_HEADER] =
				`sha256=${hmacSha256(this.options.secret, body)}`;
		}
		const doFetch = this.options.fetch ?? fetch;
		const publicOnly = !this.options.allowPrivateNetworks;
		try {
			if (publicOnly) {
				assertPublicUrl(message.to);
			}
			const response = await doFetch(message.to, {
				method: "POST",
				headers,
				body,
				// A redirect could lead to a private address. A webhook receiver answers itself.
				redirect: "manual",
				signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
				...(publicOnly ? { dispatcher: publicDispatcher() } : {}),
			});
			return {
				success: response.ok,
				response: { status: response.status },
				errors: response.ok
					? []
					: [new Error(`Webhook responded with status ${response.status}`)],
			};
		} catch (error) {
			// `fetch` reports "fetch failed" and keeps the reason in `cause`.
			const reason =
				error instanceof Error && error.cause instanceof Error
					? error.cause
					: error;
			const err = reason instanceof Error ? reason : new Error(String(reason));
			return {
				success: false,
				response: { error: err.message },
				errors: [err],
			};
		}
	}
}
