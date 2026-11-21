---
title: Public endpoints
navTitle: Public endpoints
description: The paths that an Incident Command server serves, including the RSS feed, the Markdown pages for agents and the health check.
order: 2
---

This page lists the paths that an Incident Command server serves. The paths are relative to your `SITE_URL`, for example `https://status.example.com`.

## All paths

| Path                  | Access       | What it serves                                                                                |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `/`                   | Public       | The status page.                                                                              |
| `/history`            | Public       | The incident history. `?month=YYYY-MM` selects the newest month. `?region=` selects a region. |
| `/incidents/{id}`     | Public       | One incident or maintenance.                                                                  |
| `/subscribe`          | Public       | The subscribe page.                                                                           |
| `/feed.xml`           | Public       | The RSS feed.                                                                                 |
| `/llms.txt`           | Public       | The status page in Markdown.                                                                  |
| `/history.md`         | Public       | The incident history in Markdown.                                                             |
| `/incidents/{id}.md`  | Public       | One incident in Markdown.                                                                     |
| `/api/v1/status`      | Public       | The status in JSON. Read the [REST API](/api/).                                               |
| `/api/v1/subscribers` | Bearer token | Subscribers. Read the [REST API](/api/).                                                      |
| `/api/mcp`            | Bearer token | The MCP server. Read [Connect an agent](/docs/agents/connect/).                               |
| `/manage`             | Members      | The management portal.                                                                        |
| `/healthz`            | Public       | The health check.                                                                             |

## RSS feed

`GET /feed.xml` returns an RSS feed (`application/rss+xml`). Each post of an incident or a maintenance is one item. The links in the feed use `SITE_URL`.

## Markdown for agents

These pages give the status page in Markdown, as the [llms.txt](https://llmstxt.org) proposal describes. An agent can read them without credentials.

| Path                 | Query             | Content                                                                                                                   |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/llms.txt`          | `region`          | The current status, the services, active incidents and maintenance.                                                       |
| `/history.md`        | `month`, `region` | The incident history. `month=YYYY-MM` selects the newest month. The history starts at the month of the earliest incident. |
| `/incidents/{id}.md` | None              | One incident with all its posts.                                                                                          |

The `region` value is a region id. An unknown region id returns `404` with the text "That region was not found."

> The documentation site at incident-command.org also has an `/llms.txt`. That file describes the documentation, not a status page.

## Status JSON

`GET /api/v1/status` returns the status in JSON for widgets and integrations:

- It accepts `?region=` with a region id. An unknown region id returns `404`.
- It allows requests from all origins (`access-control-allow-origin: *`).
- It has `cache-control: public, max-age=15, stale-while-revalidate=60`.

```bash
curl https://status.example.com/api/v1/status
```

The [REST API](/api/) page gives the full response.

## Health check

`GET /healthz` returns `200` with `"status":"ok"`, `200` with `"status":"degraded"`, or `503`. Read [Health check](/docs/operate/scaling/#health-check).

## Brand files

`/brand/logo` and `/brand/favicon` serve the logo and the favicon that an admin uploads in the portal.

## OAuth for agents

An MCP client finds the OAuth endpoints from these paths:

| Path                                      | Purpose                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/.well-known/oauth-protected-resource`   | The protected resource metadata of the MCP server. `/.well-known/oauth-protected-resource/api/mcp` gives the same data. |
| `/.well-known/oauth-authorization-server` | The authorization server metadata.                                                                                      |
| `/oauth/register`                         | Dynamic client registration (`POST`).                                                                                   |
| `/oauth/token`                            | The token endpoint (`POST`).                                                                                            |
| `/manage/authorize`                       | The consent page, where a member allows the agent.                                                                      |

Read [Connect an agent](/docs/agents/connect/).
