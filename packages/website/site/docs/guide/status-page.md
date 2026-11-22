---
title: Status page and subscriptions
navTitle: Status page and subscriptions
description: Read the status page, the uptime bars, the incident history and the incident pages, and subscribe to updates by email, text message, webhook or RSS.
order: 9
---

The status page shows if the services of a company work correctly. It tells you about incidents and planned maintenance. You can subscribe to get updates. An account is not necessary.

Operators can give this page to their visitors. The links on this page use paths, for example `/history`. Add the paths to the address of the status page, for example `https://status.example.com/history`.

![A status page in light mode](/images/status-page.png)

## Read the overall status

The banner at the top shows the overall status. The overall status is the worst status of all the services and the active incidents.

| Banner                                    | What it tells you                        |
| ----------------------------------------- | ---------------------------------------- |
| "We're fully operational"                 | All services work correctly.             |
| "Maintenance in progress"                 | Planned work is active on some services. |
| "We're experiencing degraded performance" | Some services are slower than usual.     |
| "We're experiencing a partial outage"     | Some services do not work correctly.     |
| "We're experiencing a major outage"       | At least one service does not work.      |

The company can add a description under the banner.

## Read the services and the uptime bars

The **System status** card lists each service. Services can be in groups. Each service shows these items:

- An icon and the name of the service.
- The uptime percentage when the service is operational, or the status when it has a problem.
- A row of bars, one bar for each day.

Each bar shows the worst status of the service on that day. Move the pointer onto a bar to see the date, the status, the uptime and the incidents of that day. A bar shows "No data" for a day before the company added the service. The uptime on a bar uses the time with data on that day.

The bars show 90 days by default. The company can change this number. On a phone, the bars show the last 30 days.

The uptime percentage uses the full uptime window, through now. Time before the company added the service is not downtime. A partial outage counts as 30% downtime, and a major outage counts as 100% downtime. Degraded performance and maintenance count as uptime.

The default theme follows the light or dark mode of your device.

![A status page in dark mode](/images/status-page-dark.png)

## Use the region tabs

Some status pages have regions, for example "United States" and "Europe". These pages show a row of tabs above the banner.

- **Overview** shows each outage on all services. Its uptime counts each outage.
- A region tab shows the status of the services in that region only. An outage that is not in that region does not show on the tab. The uptime on a region tab counts only the outages in that region.

Select a tab to see the status for that region. The history page has the same tabs.

## Read the active incidents and maintenance

An active incident or active maintenance shows as a card under the banner. Each card shows these items:

- The title and the status.
- The affected services.
- The latest update and its time.
- For maintenance, the time of the window.

The **Upcoming maintenance** section shows planned work that did not start.

Select a card to open the incident page. The **Recent incidents** section shows the incidents of the last 14 days.

All times show in the time zone of your device.

## Read the incident history

1. Select **View history →** under **Recent incidents**, or select **History** at the bottom of the page.
2. Read the incidents of the last three months on `/history`. Each month has its own list.
3. To see older months, select **← Older**. To come back, select **Newer →**.

Each page of the history shows three months. To open one month, add `?month=` and the month to the address. For example, `/history?month=2026-03` shows March 2026 and the two months before it.

Select **Current status** to go back to the status page.

## Read an incident page

Select an incident on the status page or in the history. The incident page is at `/incidents/` and the incident ID.

![A public incident page with the status of the affected services](/images/status-page-incident.png)

The page shows these items:

- The kind: **Incident** or **Scheduled maintenance**.
- The title, the status and, for an incident, the impact.
- The region or regions, when the status page has regions.
- The start time, or the maintenance window.
- The time of the resolution and the duration, when the incident is resolved.
- The affected services.
- **Status of the affected services**: a bar for each service, with the status for each minute.
- **Updates**: each update of the incident, with its time.

The status bars start 2 hours before the incident started. They stop 2 hours after the incident ended, or now for an open incident. Under each bar, a list shows when a problem started and when the service recovered.

Select **← Back to status** to go back to the status page.

## Subscribe to updates

Select **Subscribe to updates** in the header of the status page. The button shows only when the status page can send updates.

![The subscribe page with the channel choice and the service choice](/images/status-page-subscribe.png)

1. On `/subscribe`, select a channel: **Email**, **Text message** or **Webhook**. The page shows only the channels that the status page can use.
2. Type your address in the field:
   - **Email address**: your email address.
   - **Phone number**: your phone number with the country code, for example `+15551234567`.
   - **Webhook URL**: a Slack, Discord or other URL that accepts JSON.
3. Optional: under **Services**, select the services that send you updates. Select no service to get updates for all services.
4. Select **Subscribe**.
5. Open the confirmation link that the status page sends to your address.

The page shows "Check your inbox", "Check your phone" or "Check your webhook". You get no updates until you open the confirmation link. After you open it, the page shows "You're subscribed".

You get an update when the company declares, updates or resolves an incident, or schedules maintenance.

If the address already gets updates, the page shows "You're already subscribed".

## Select your services

You can change the services that send you updates.

1. Open the link to choose services. The "You're subscribed" page has this link. Each update email has a "Choose services" link at the bottom.
2. Select the services that send you updates. Select no service to get updates for all services.
3. Select **Save services**.

The page shows "Services saved".

## Unsubscribe

To stop email updates, use the link in the email:

1. Select **Unsubscribe** at the bottom of an update email.
2. On the page that opens, select **Unsubscribe**.

To stop updates for any channel, use the unsubscribe page:

1. Go to `/subscribe/unsubscribe`. The subscribe page also has a link to it.
2. Select the channel: **Email**, **Text message** or **Webhook**.
3. Type the address that gets the updates.
4. Select **Unsubscribe**.

The page shows "You've been unsubscribed". It shows the same message when the address had no subscription.

## Use the RSS feed

To get updates in a feed reader, add `/feed.xml` to your feed reader. Select **RSS** at the bottom of the status page to get this address. The feed has one item for each update, and it has the 50 newest updates.

The bottom of the status page also has links to the **API** and **llms.txt**. Programs and AI agents use these pages. See [Public endpoints](/docs/reference/public-endpoints/).
