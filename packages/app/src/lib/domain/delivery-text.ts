import type {
	DeliveryFailure,
	DeliveryState,
	NotificationChannel,
} from "./types";

/** The name of a channel in the portal. */
export const CHANNEL_NOUNS: Record<NotificationChannel, string> = {
	email: "Email",
	sms: "Text message",
	webhook: "Webhook",
};

/** The label of a delivery state in the portal. */
export const DELIVERY_STATE_LABELS: Record<DeliveryState, string> = {
	pending: "Waiting",
	sending: "In progress",
	sent: "Sent",
	failed: "Failed",
};

/** The cause of a failed notification, in portal text. */
export const DELIVERY_FAILURE_TEXT: Record<DeliveryFailure, string> = {
	provider: "The provider or the webhook did not accept the notification.",
	not_sent:
		"The server did not send the notification. The subscriber or the channel was not available.",
	interrupted:
		"The server stopped before it recorded a result. It is possible that the subscriber got the notification.",
};
