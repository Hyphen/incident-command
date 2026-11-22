---
title: Notification providers
navTitle: Notification providers
description: Set up the webhook, email and text message channels, add SendGrid, Amazon SES, Twilio or Amazon SNS providers, and select a delivery strategy.
order: 2
---

Incident Command sends notifications through [airhorn](https://airhorn.org). An admin sets up notifications in **Manage → Settings → Notifications**. This page is for the operator who sets up the providers. The [Settings](/docs/guide/settings/) page shows the portal screens.

## Channels

There are three channels: webhooks, email and text messages. Each channel has an on/off switch.

- **Webhooks** have only the on/off switch. The server sends each webhook itself, so webhooks have no providers, no delivery strategy and no sender.
- **Email** uses SendGrid or Amazon SES.
- **Text messages** use Twilio or Amazon SNS.

The public subscribe page shows each channel that is on and can send. To stop public sign-ups through a channel, turn that channel off.

## Providers

Email and text messages can have more than one provider. Add a provider with **Add provider** on the channel.

| Channel       | Provider   | Credentials                                                             |
| ------------- | ---------- | ----------------------------------------------------------------------- |
| Email         | SendGrid   | An API key.                                                             |
| Email         | Amazon SES | An access key and a secret access key, or the IAM role of the platform. |
| Text messages | Twilio     | An account SID and an auth token.                                       |
| Text messages | Amazon SNS | An access key and a secret access key, or the IAM role of the platform. |

The server encrypts the credentials with `ENCRYPTION_KEY` before it stores them. Set the key before you add a provider with credentials. Read [Secrets and key rotation](/docs/operate/secrets/).

## Delivery strategy

A channel with more than one provider has a delivery strategy:

- **Active/passive** (airhorn fail-over): the first provider sends. When a send fails, the next provider sends. Use **Move up** and **Move down** to set the order.
- **Load balanced** (airhorn round-robin): each message goes through the next provider in turn. A failed send does not go to a different provider.

## Sender

Email and text messages need a sender. Set a default sender on the channel, or a sender on each provider. A sender on a provider replaces the sender of the channel.

- `EMAIL_FROM` sets the default sender of the email channel.
- Amazon SNS accepts a sender ID of up to 11 letters and digits. When the sender is a phone number, SNS uses it as the origination number. The number must be an origination number of your AWS account.

## Webhooks

- A webhook posts only to public internet addresses. The server refuses a URL whose host is, or resolves to, a private, loopback, link-local or reserved address.
- The server does not follow redirects. It stops a request after 10 seconds.
- To post to a webhook in your own network, turn on **Allow private network addresses** in **Manage → Settings → Notifications → Webhooks**.
- When `WEBHOOK_SECRET` is set, the server signs each request. Read [Webhooks](/docs/reference/webhooks/) for the payload and the signature.

## Notification queue

An admin selects one queue in **Manage → Settings → Notifications**, or **No queue**.

- With no queue, the server sends the notifications when a member sends them. A window shows the number of successful notifications and the number of failed notifications.
- With a queue, the server sends the notifications in the background. The **Dashboard** tab of the incident shows a progress bar until the queue is done.
- The queue providers are Redis, RabbitMQ and NATS. Select one. Each provider keeps the tasks.
- NATS needs JetStream. Do not put a user or a password in the NATS URI.
- The server keeps the **Connection URI** encrypted with `ENCRYPTION_KEY`. Set the key before you save a queue.
- The queue runs in the Node.js server. On Cloudflare, the container runs the queue, not the Worker.
- After a restart, the server continues a job that stopped.
- If the queue provider cannot load, the server sends the notifications in its own process.

## Providers from environment variables

A channel without providers uses the providers from environment variables. When you add a provider to a channel in the portal, that channel no longer uses them.

- Webhooks use the built-in webhook sender. It signs each request when `WEBHOOK_SECRET` is set.
- Email uses SendGrid when `SENDGRID_API_KEY` is set. It uses Amazon SES when `AWS_SES_REGION` is set, or when `AWS_REGION` and `EMAIL_PROVIDER=ses` are set.
- SES uses `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, or the IAM role of the platform.
- Text messages have no environment variables. Add a text message provider in the portal.

## Subscriptions

- A visitor subscribes on `/subscribe`. The channel sends a confirmation link to the address, phone number or URL. Notifications start only after a click on that link.
- A webhook confirmation has `"event": "subscription.confirm"`, `text`, `content` and `confirmUrl`. Slack and Discord show the text with the link.
- A visitor unsubscribes on `/subscribe/unsubscribe`. Each email has an **Unsubscribe** link to that page for the subscription. The visitor then selects **Unsubscribe**.
- An admin can add subscribers in the portal, with the API or with the `add_subscriber` MCP tool. These subscribers get no confirmation. Get consent before you add a phone number.
- The links in each notification use the **Public URL** setting in **Manage → Settings → General**. When that setting is empty, they use `SITE_URL`. Set one of them to the public URL of the status page.
