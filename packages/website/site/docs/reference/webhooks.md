---
title: Webhooks
navTitle: Webhooks
description: The events, the JSON payload and the HMAC-SHA256 signature of Incident Command webhooks, with code to verify a request.
order: 3
---

A webhook subscriber gets an HTTP `POST` with a JSON body for each notification. The `text` and `content` fields hold a short summary, so Slack and Discord show the message without changes. An integration can read the structured fields.

## Events

| Event                   | When                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `incident.created`      | An incident starts.                                                        |
| `incident.updated`      | An incident gets a new post.                                               |
| `incident.resolved`     | An incident is resolved.                                                   |
| `maintenance.scheduled` | A maintenance is scheduled.                                                |
| `maintenance.updated`   | A maintenance gets a new post.                                             |
| `maintenance.completed` | A maintenance is completed.                                                |
| `subscription.confirm`  | A visitor subscribes a webhook URL. The request has the confirmation link. |

Each new incident, post and resolution notifies the subscribers, unless the author turns off **Notify subscribers**. The author needs the `notifications.send` permission. An agent without that permission writes a draft, and a person approves it. A subscriber with a service choice gets only the notifications of those services.

## Request

- Method: `POST`
- Headers: `content-type: application/json`, `user-agent: incident-command`, and `x-incident-command-signature` when `WEBHOOK_SECRET` is set.
- The server stops the request after 10 seconds. It does not follow redirects. A response with a status of 200 to 299 is a success.

## Payload

An incident or maintenance event:

```json
{
	"event": "incident.updated",
	"text": "[Acme Cloud] Incident update: API errors in US East\nIdentified: We found the cause and are rolling out a fix.\nhttps://status.example.com/incidents/inc_123",
	"content": "[Acme Cloud] Incident update: API errors in US East\nIdentified: We found the cause and are rolling out a fix.\nhttps://status.example.com/incidents/inc_123",
	"incident": {
		"id": "inc_123",
		"kind": "incident",
		"title": "API errors in US East",
		"status": "identified",
		"impact": "major",
		"url": "https://status.example.com/incidents/inc_123",
		"services": [
			{ "id": "svc_456", "name": "REST API", "status": "partial_outage" }
		],
		"startedAt": "2026-11-21T09:12:00.000Z",
		"regionIds": ["reg_789"]
	},
	"update": {
		"id": "upd_012",
		"title": "API errors in US East",
		"impact": "major",
		"status": "identified",
		"message": "We found the cause and are rolling out a fix.",
		"createdAt": "2026-11-21T09:40:00.000Z"
	},
	"page": { "name": "Acme Cloud", "url": "https://status.example.com" },
	"timestamp": "2026-11-21T09:40:01.000Z"
}
```

| Field                                              | Description                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`                                            | One of the events in the table above.                                                                                                                |
| `text`, `content`                                  | The same summary: the site name, the event, the title, the status, the message and the link.                                                         |
| `incident.kind`                                    | `incident` or `maintenance`.                                                                                                                         |
| `incident.status`                                  | `investigating`, `identified`, `monitoring` or `resolved` for an incident. `scheduled`, `in_progress`, `verifying` or `completed` for a maintenance. |
| `incident.impact`                                  | `none`, `minor`, `major` or `critical`.                                                                                                              |
| `incident.url`                                     | The public incident page. It is not in the payload when no public URL is set (the **Public URL** setting or `SITE_URL`).                             |
| `incident.startedAt`, `incident.resolvedAt`        | The start and the end of an incident. A field without a value is not in the payload.                                                                 |
| `incident.scheduledStart`, `incident.scheduledEnd` | The window of a maintenance.                                                                                                                         |
| `incident.services`                                | The affected services, each with its current status.                                                                                                 |
| `incident.regionIds`                               | The regions of the incident. The list is empty when the status page has no regions.                                                                                             |
| `update`                                           | The post that caused the notification.                                                                                                               |
| `page`                                             | The name and the URL of the status page.                                                                                                             |
| `timestamp`                                        | The time of the request.                                                                                                                             |

A confirmation:

```json
{
	"event": "subscription.confirm",
	"text": "[Acme Cloud] Confirm your subscription to status updates.\nhttps://status.example.com/subscribe/confirm?token=…",
	"content": "[Acme Cloud] Confirm your subscription to status updates.\nhttps://status.example.com/subscribe/confirm?token=…",
	"confirmUrl": "https://status.example.com/subscribe/confirm?token=…",
	"page": { "name": "Acme Cloud", "url": "https://status.example.com" },
	"timestamp": "2026-11-21T09:40:01.000Z"
}
```

Open `confirmUrl` to start the notifications. An integration can do this itself.

## Signature

When `WEBHOOK_SECRET` is set, each request has this header:

```http
x-incident-command-signature: sha256=<hex>
```

The value is the HMAC-SHA256 of the raw request body, with `WEBHOOK_SECRET` as the key, in hexadecimal. To verify a request:

1. Read the raw body before you parse the JSON.
2. Calculate the HMAC-SHA256 of the raw body with your copy of the secret.
3. Compare the result with the header value in constant time.
4. Refuse the request when the values are different.

Node.js example:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(
	rawBody: string,
	header: string | null,
	secret: string,
): boolean {
	if (!header?.startsWith("sha256=")) return false;
	const expected = Buffer.from(
		createHmac("sha256", secret).update(rawBody).digest("hex"),
	);
	const received = Buffer.from(header.slice("sha256=".length));
	return (
		expected.length === received.length && timingSafeEqual(expected, received)
	);
}
```

## Private addresses

The server posts only to public internet addresses. It refuses a URL whose host is, or resolves to, a private, loopback, link-local or reserved address. To post to a receiver in your own network, an admin turns on **Allow private network addresses** in **Manage → Settings → Notifications → Webhooks**.
