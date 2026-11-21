---
title: Introduction
navTitle: Introduction
description: Incident Command is an open source status page, a management portal for your team, and an MCP server for AI agents.
order: 1
---

Incident Command is an open source incident command system. It has three parts:

- A **status page** that your customers read.
- A **management portal** at `/manage` that your team uses.
- An **MCP server** at `/api/mcp` that AI agents use.

One Next.js server runs all three parts. You can run it on any container host. The project publishes a container image on Docker Hub for each release.

![The status page](/images/status-page.png)

## Features

- **Status page:** an overall status banner, active incidents, scheduled maintenance, and grouped services with 90-day uptime bars. It also has the incident history and a page for each incident. An incident page shows the status of each affected service for each minute. The status page has an RSS feed, a public JSON API, and light and dark modes. It works on a phone.
- **Regions:** add a region when you need one. Each affected service can use one region, more than one region, or no region. No region means Global. With regions, the status page shows an Overview tab and a tab for each region.
- **Pages for agents:** `/llms.txt`, `/history.md` and `/incidents/{id}.md` give the status page in Markdown. An agent can read them without credentials.
- **MCP server:** each agent has its own permissions. A new agent can read the status page and write drafts. It cannot publish or notify subscribers until an admin gives it those permissions.
- **Human review of notifications:** an agent can save a notification as a draft. A person reviews the draft, changes it if necessary, and approves it. Nothing goes out before the approval.
- **Management portal:** declare incidents, post updates, schedule maintenance, and manage services, regions, members, agents, subscribers and settings.
- **Two-factor authentication:** members use an authenticator app and recovery codes. An admin can require two-factor authentication for all members. The requirement is on by default.
- **Themes:** select a theme preset, add a logo and a favicon, and add custom CSS from the portal.
- **Storage:** PostgreSQL, MongoDB or memory, from `DATABASE_URI`. A read cache keeps the status page online when the database is offline.
- **Notifications:** signed webhooks (Slack and Discord compatible), email through SendGrid or Amazon SES, and text messages through Twilio or Amazon SNS. Visitors subscribe with double opt-in and can select the services that send them a notification.

## How it works

```
            ┌──────────── Next.js (App Router) ────────────┐
 browsers ─▶│ status page · /manage portal · /api/v1 · RSS  │
 agents ───▶│ /api/mcp (MCP SDK, stateless Streamable HTTP) │
            └───────────────────────┬──────────────────────┘
                                    ▼
                      services (business logic, permissions)
                     │                         │
                     ▼                         ▼
          CachedStore (cacheable)        Notifier (airhorn)
     stale-while-offline read cache    webhooks · email · SMS
                     │
                     ▼
     DocumentStore adapter: Postgres (jsonb) · MongoDB · memory
```

- The portal, the MCP server and the public pages use the same services. The services do all permission checks.
- The read cache serves the last known data when the database is offline.
- The notifier sends each notification through [airhorn](https://airhorn.org).

## Where to start

| You want to                           | Read                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Try Incident Command on your computer | [Quick start](/docs/getting-started/quick-start/)                           |
| Learn the words that the docs use     | [Concepts](/docs/getting-started/concepts/)                                 |
| Run it in production                  | [Choose a platform](/docs/deploy/choose-a-platform/)                        |
| Use the portal                        | [Portal tour and roles](/docs/guide/portal/)                                |
| Connect an AI agent                   | [Connect an agent](/docs/agents/connect/)                                   |
| Integrate with the API                | [REST API](/api/) and [Public endpoints](/docs/reference/public-endpoints/) |

## License

Incident Command is open source under the [MIT license](https://github.com/jaredwray/incident-command/blob/main/LICENSE).
