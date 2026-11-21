---
title: Subscribers
navTitle: Subscribers
description: See the subscribers of your status page, add a pre-confirmed email address, phone number or webhook, set their services and remove them.
order: 7
---

Subscribers get a notification when you declare, update or resolve an incident, or schedule maintenance. A subscriber is an email address, a phone number for text messages, or a webhook URL. Visitors subscribe on the public status page. An admin can also add a subscriber in the portal.

You must be an admin to use the **Subscribers** page. For the visitor steps, see [Status page and subscriptions](/docs/guide/status-page/#subscribe-to-updates).

![The Subscribers page with the add form and the list of subscribers](/images/manage-subscribers.png)

## The Subscribers page

Select **Subscribers** in the sidebar. The page has these parts:

- A message about the channels that cannot send now. This message shows only when a channel cannot send.
- **Add a subscriber**: the form for a new subscriber.
- **Subscribers**: each subscriber, with the number of subscribers in the title.

Each subscriber shows the address, the type, the state and the date. The type is **Webhook**, **Email** or **Text message**. The state is one of these values:

- "Confirmed": the subscriber gets notifications.
- "Pending confirmation": the visitor did not open the confirmation link yet. The subscriber gets no notifications.

## Add a subscriber

You must be an admin.

A subscriber that you add is confirmed at once. The portal does not send a confirmation link. Thus, get the consent of the person before you add an email address or a phone number.

1. Go to **Subscribers**.
2. In **Type**, select **Webhook**, **Email** or **Text message**.
3. Type the address in the field for that type:
   - **Webhook URL**: an `https` or `http` URL. The payload has text for Slack and content for Discord. See [Webhooks](/docs/reference/webhooks/).
   - **Email address**: the email address of the subscriber.
   - **Phone number**: the number in E.164 format, with the country code. For example, `+15551234567`.
4. Optional: under **Services**, select the services that send a notification. Select no service for all services.
5. Select **Add**.

The page shows "Subscriber added".

A type shows "Not available" when its channel cannot send. To make the channel available, see [Settings](/docs/guide/settings/#notifications).

## Set the services of a subscriber

You must be an admin.

1. Go to **Subscribers**.
2. Under the subscriber, select or clear the services.
3. Select **Save services**.

The page shows "Services saved". A subscriber with no services gets a notification for all services.

A subscriber with services gets a notification only when the incident affects one of those services. An incident with no affected services goes only to the subscribers with no services.

Visitors can also change their services with the link in each email. See [Select your services](/docs/guide/status-page/#select-your-services).

## Remove a subscriber

You must be an admin.

1. Go to **Subscribers**.
2. Next to the subscriber, select **Remove**.
3. In the dialog, select **OK**.

The page shows "Subscriber removed". The subscriber gets no more notifications.

## Who gets a notification

The status page sends a notification to a subscriber only when all these conditions are true:

- The subscriber is confirmed.
- The incident affects one of the services of the subscriber, or the subscriber has no services.
- The update has its notification on. A member or an agent can turn it off for one update. An approved draft always notifies subscribers.
- The channel of the subscriber is on and can send.

Hidden services do not show on the public subscribe page. In the portal, you can give a subscriber a hidden service.
