---
title: Concepts
navTitle: Concepts
description: The words that the Incident Command docs, the portal, the API and the MCP server use, with their meanings.
order: 2
---

This page gives the meaning of each word that the docs use. The portal, the API and the MCP tools use the same words.

## Status page

| Word               | Meaning                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**        | A part of your product that visitors care about, for example "API" or "Dashboard". Each service has a status.                                                                                                                                                                               |
| **Group**          | A name that puts services together on the status page, for example "Core platform".                                                                                                                                                                                                         |
| **Service status** | One of `operational`, `degraded_performance`, `partial_outage`, `major_outage` or `under_maintenance`. An open incident or maintenance sets it. An editor can also set it by hand.                                                                                                          |
| **Region** | A named area, for example "US East". With regions, the status page shows an Overview tab and a tab for each region. When a region exists, each affected service of an incident needs one or more regions. For an outage in all regions, select all regions. |
| **Overview** | The first tab of a status page with regions. It shows each outage. A region tab shows an outage only for the services in that region. |
| **Uptime**         | The share of the uptime window that a service was up. Time before the service existed is not downtime. A day before the service existed shows "No data". A partial outage counts as 30% downtime, and a major outage counts as 100% downtime. Degraded performance and maintenance count as uptime. The uptime window is 90 days by default, and an admin can change it. |

## Incidents and maintenance

| Word            | Meaning                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Incident**    | An unplanned problem. Its status is `investigating`, `identified`, `monitoring` or `resolved`.                                                                  |
| **Maintenance** | Planned work in a time window. Its status is `scheduled`, `in_progress`, `verifying` or `completed`.                                                            |
| **Impact**      | How bad an incident is: `none`, `minor`, `major` or `critical`.                                                                                                 |
| **Post**        | One update on an incident or maintenance. A post has a title, an impact, a status and a message. The API and the MCP tools call a post an "update".             |
| **Draft**       | A notification that an agent prepares but cannot send. A person reviews the draft and approves or discards it. A draft is `pending`, `approved` or `discarded`. |

## People and agents

| Word           | Meaning                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member**     | A person with a portal account.                                                                                                                 |
| **Role**       | The access level of a member: `viewer`, `editor` or `admin`. Viewers can read. Editors manage incidents and services. Admins manage everything. |
| **Invite**     | A one-time link that an admin makes for a new member. It expires after 7 days.                                                                  |
| **Agent**      | An AI agent or a script that uses the MCP server. Each agent has its own permissions.                                                           |
| **Permission** | One thing that a member role or an agent can do, for example `incidents.publish`.                                                               |
| **API token**  | A secret that starts with `icmd_`. A script that cannot sign in uses it as a bearer token for the MCP server and the API.                       |

## Notifications

| Word                  | Meaning                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Subscriber**        | An email address, a phone number or a webhook URL that gets notifications. A visitor confirms a subscription with a link (double opt-in). |
| **Service choice**    | The services that send a notification to a subscriber. No choice means all services.                                                      |
| **Channel**           | A way to send a notification: webhooks, email or text messages. Each channel has an on/off switch.                                        |
| **Provider**          | The service that sends email or text messages for a channel: SendGrid, Amazon SES, Twilio or Amazon SNS.                                  |
| **Delivery strategy** | How a channel with more than one provider sends: active/passive (fail-over) or load balanced (round-robin).                               |
| **Queue** | An optional Redis, RabbitMQ or NATS service. With a queue, the server sends notifications in the background. |
