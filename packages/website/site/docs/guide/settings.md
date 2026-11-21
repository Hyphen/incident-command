---
title: Settings
navTitle: Settings
description: Change the name, links, uptime window and two-factor rule of your status page, and turn notification channels on and off.
order: 8
---

The **Settings** page has three sections: **General**, **Branding** and **Notifications**. Select a section at the top of the page.

You must be an admin to use the **Settings** page.

## General

The **General** section has the main options of the status page.

![The General section of the settings](/images/manage-settings.png)

| Field                                 | What it does                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Name**                              | The name of the status page. The status page, the portal and the notifications show it.                          |
| **Public URL**                        | The address of the status page, for example `https://status.example.com`. Notifications and invite links use it. |
| **Support URL**                       | An address for help. The status page shows a **Support** link to it in the header.                               |
| **Uptime window (days)**              | The number of days in the uptime bars and the uptime percentages. Use a number from 7 to 365. The default is 90. |
| **Description**                       | An optional text. The status page shows it under the status banner.                                              |
| **Require two-factor authentication** | Each member must use an authenticator app. This option is on by default.                                         |

## Change the general settings

You must be an admin.

1. Go to **Settings**.
2. Change the fields in the **General** section.
3. Select **Save settings**.

The page shows "Settings saved".

Set the **Public URL** before you send notifications. Emails, text messages and webhooks use it for the incident links, the confirmation links and the unsubscribe links. When the field is empty, the server uses `SITE_URL`. See [Environment variables](/docs/reference/environment-variables/).

## Make two-factor authentication necessary

You must be an admin.

1. Go to **Settings**.
2. In **Two-factor authentication**, select or clear **Require two-factor authentication**.
3. Select **Save settings**.

When the option is on, a member without an authenticator must set one up before the member opens the portal. A member cannot turn off two-factor authentication. For the steps of a member, see [When two-factor authentication is necessary](/docs/guide/account/#when-two-factor-authentication-is-necessary).

When you clear the option, members keep their authenticators.

## Branding

The **Branding** section has the theme, the logo, the favicon, the custom CSS and the "Powered by" line. See [Branding in the portal](/docs/theming/branding/).

## Notifications

The **Notifications** section has one card for each notification channel: **Webhooks**, **Email** and **Text messaging**. A channel sends notifications and the confirmation links of the public subscribe page.

For each provider and its credentials, see [Notification providers](/docs/operate/notifications/).

![The Notifications section with the channel cards](/images/manage-notifications.png)

The top right corner of each card shows the state of the channel:

- **On**: the channel can send.
- **Off**: the channel does not send.
- **Not ready**: the channel is on, but it has no provider or no sender.

When a channel cannot send, its subscribers get no notifications. The public subscribe page does not offer that channel.

## Turn a channel on or off

You must be an admin.

1. Go to **Settings**.
2. Select **Notifications**.
3. In the card of the channel, select or clear the check box. The labels are **Send webhook notifications**, **Send email notifications** and **Send text message notifications**.
4. Select **Save channel**.

The page shows "Channel saved".

## Set the delivery strategy and the sender

You must be an admin. The **Email** and **Text messaging** cards have these fields:

- **Delivery strategy**: **Active/passive** sends through the first provider. The next provider sends only when a send fails. **Load balanced** sends each message through the next provider in turn.
- **Default from address** (email) or **Default from number or sender ID** (text messages): the sender for each provider that has no sender of its own.

Do these steps:

1. Go to **Settings**.
2. Select **Notifications**.
3. In the card of the channel, select the **Delivery strategy**.
4. Type the sender in the sender field.
5. Select **Save channel**.

## Providers

The **Email** and **Text messaging** cards have a **Providers** list. Each provider shows its type, its role and the credentials that are saved. The role is **Active**, **Passive 1**, **Passive 2** and so on, or **Load balanced**.

Use these buttons in the list:

- **Add provider**: adds a provider to the channel.
- **Move up** and **Move down**: change the order. With **Active/passive**, the first provider is active.
- **Edit**, then **Save provider**: changes the name, the sender or the credentials.
- **Remove**: removes the provider.

Only a person can change providers. An agent cannot add, change, move or remove a provider.

The server must have `ENCRYPTION_KEY` to save provider credentials. If it is not set, the page shows a message about it. See [Secrets and key rotation](/docs/operate/secrets/).

A channel can also use providers from environment variables. When the channel has no providers in the list, the card names these providers. When you add a provider in the portal, the channel does not use the environment providers.

## Allow private network addresses

You must be an admin. The **Webhooks** card has the **Allow private network addresses** check box.

When the box is clear, webhooks cannot post to hosts in a private network, for example `10.0.0.0/8`, `192.168.0.0/16` or `localhost`. Anyone can add a webhook on the public subscribe page. Thus, select this box only for an internal webhook.

1. Go to **Settings**.
2. Select **Notifications**.
3. In the **Webhooks** card, select **Allow private network addresses**.
4. Select **Save channel**.
