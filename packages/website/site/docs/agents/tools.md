---
title: MCP tools
navTitle: MCP tools
description: The 45 tools of the Incident Command MCP server, grouped by the permission that each tool needs.
order: 3
---

The MCP server has 45 tools. An agent sees only the tools that its permissions allow. Call `whoami` to see the permissions of the connection. See [Agent permissions](/docs/agents/permissions/).

The tables on this page group the tools by area. In each table, the tools are in the order of their permission.

## Results and errors

- A result is JSON in a text content block.
- An expected failure comes back as a tool error with `isError: true`. The message starts with a code, for example `not_found: Incident "inc_123" was not found`. The codes are `bad_request`, `forbidden`, `not_found`, `conflict` and `unavailable`.
- An unexpected failure returns `internal_error: Something went wrong`. It does not show details.
- A call to a tool that the agent cannot see returns a `forbidden` error. The message names the permission that the agent does not have.
- Each read tool has the MCP annotation `readOnlyHint`. Each tool whose name starts with `delete`, `remove` or `revoke` has `destructiveHint`.

At each connection, the server also sends instructions to the agent. They explain the incident flow, the service statuses, the regions and the drafts. An agent without `incidents.publish` gets an instruction to use `draft_notification`. An agent with `settings.write` gets the design steps.

## Identity

| Tool     | Permission | What it does                                                                    |
| -------- | ---------- | ------------------------------------------------------------------------------- |
| `whoami` | none       | Return the identity, the permissions and the credential type of the connection. |

## Status

| Tool             | Permission    | What it does                                                                                                     |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `get_status`     | `status.read` | Return the overall status, each visible service with status and uptime, and open incidents and maintenance.      |
| `list_services`  | `status.read` | List all services in display order, with the hidden services.                                                    |
| `list_regions`   | `status.read` | List the named regions in display order.                                              |
| `list_incidents` | `status.read` | List incidents and maintenance, newest first. Filter by `kind` and `open`. The `limit` is 1 to 100 (default 20). |
| `get_incident`   | `status.read` | Return one incident or maintenance with its full timeline. Each update has the title and the impact.             |

Pass `regionId` to `get_status` to read one region. Without `regionId`, the tool reads Overview.

## Services and regions

| Tool                 | Permission            | What it does                                                                                 |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `create_service`     | `services.write`      | Add a service, with an optional description, group, status and `hidden` flag.                |
| `update_service`     | `services.write`      | Edit a service. `null` or an empty string clears the description or the group.               |
| `create_region`      | `services.write`      | Add a named region. The status page then shows Overview and a tab for each region.           |
| `update_region`      | `services.write`      | Rename a region or change its display order.                                                 |
| `set_service_status` | `services.set_status` | Change the status of a service without an incident. The change goes into the uptime history. |
| `delete_service`     | `services.delete`     | Delete a service and its status history.                                                     |
| `delete_region`      | `services.delete`     | Delete a region. It fails while an open incident needs it as the only region of a service.                        |

## Incidents and maintenance

| Tool                   | Permission          | What it does                                                                                                                            |
| ---------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `create_incident`      | `incidents.publish` | Declare an incident with a first update. The affected services change status from the impact.                                           |
| `post_incident_update` | `incidents.publish` | Add a timeline update. It can change the title, the impact, the status, the services and each service status.                           |
| `resolve_incident`     | `incidents.publish` | Resolve an incident or complete maintenance. The affected services become `operational`, unless a different open incident affects them. |
| `schedule_maintenance` | `incidents.publish` | Announce planned maintenance with a start and an end.                                                                                   |
| `edit_incident`        | `incidents.edit`    | Replace the service list or the regions of each service, or change the maintenance window. It posts no update.                          |
| `delete_incident`      | `incidents.delete`  | Remove an incident or maintenance from the public view. Send a `reason`. The portal keeps the record, the agent and the reason.         |

The services, regions and statuses follow fixed rules. See [How incidents affect services](/docs/agents/workflows/#how-incidents-affect-services).

## Notification drafts

| Tool                     | Permission     | What it does                                                                              |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `draft_notification`     | `drafts.write` | Save a notification for review by a person. Return the `reviewUrl`.                       |
| `get_notification_draft` | `drafts.read`  | Return one notification draft and its review state: `pending`, `approved` or `discarded`. |

See [Notification drafts with human review](/docs/agents/workflows/#notification-drafts-with-human-review).

## Members

| Tool            | Permission       | What it does                                                                                                    |
| --------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `list_members`  | `members.read`   | List the portal members.                                                                                        |
| `list_invites`  | `members.read`   | List the invites that nobody used yet, with their expiry times.                                                 |
| `invite_member` | `members.manage` | Create a one-time `inviteUrl`, valid for 7 days. The person creates their account with it.                      |
| `revoke_invite` | `members.manage` | Remove an invite. Its link stops immediately.                                                                   |
| `update_member` | `members.manage` | Change the name, email, role or password of a member. A new password stops the OAuth connections of the member. |
| `remove_member` | `members.manage` | Remove a member and sign them out. You cannot remove the last admin.                                            |

A new invite for the same email replaces the old link.

## Agents

| Tool                  | Permission      | What it does                                                                                             |
| --------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `list_agents`         | `agents.read`   | List the agents, their permissions and their credentials. It never returns a secret.                     |
| `list_agent_activity` | `agents.read`   | List the recent activity of one agent, newest first. The `limit` is 1 to 100 (default 50).               |
| `create_agent`        | `agents.manage` | Create an agent. Without `permissions`, the agent gets the default permissions.                          |
| `update_agent`        | `agents.manage` | Change the name, the description or the permissions of an agent. Send the current `revision`.            |
| `delete_agent`        | `agents.manage` | Delete an agent, its credentials and its activity log.                                                   |
| `create_agent_token`  | `agents.manage` | Create an API token for an agent, with an optional `expiresInDays`. The result shows the token one time. |
| `revoke_agent_token`  | `agents.manage` | Revoke a token immediately.                                                                              |

## Settings and design

| Tool                 | Permission       | What it does                                                                                                        |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `get_settings`       | `settings.read`  | Return the settings and the branding, with `logoUrl` and `faviconUrl` when a stored file exists.                    |
| `get_design_guide`   | `settings.write` | Return the theme presets, design tokens, CSS selectors, rules, limits and an example stylesheet.                    |
| `update_settings`    | `settings.write` | Change the name, description, URLs, theme, custom CSS, uptime window, "Powered by" line and two-factor requirement. |
| `upload_brand_asset` | `settings.write` | Store the logo or the favicon. It replaces the stored file.                                                         |
| `remove_brand_asset` | `settings.write` | Remove the stored logo or favicon.                                                                                  |

The uptime window (`uptimeDays`) is 7 to 365 days. See [Design the status page through MCP](/docs/agents/workflows/#design-the-status-page-through-mcp).

## Notification channels

| Tool                          | Permission       | What it does                                                                                                               |
| ----------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `get_notification_settings`   | `channels.read`  | Return the webhook, email and text message channels: on or off, strategy, sender and providers. It returns no credentials. |
| `update_notification_channel` | `channels.write` | Turn a channel on or off, set its strategy (`active_passive` or `load_balanced`), or set its sender.                       |

Webhooks have only the on and off switch, because the server sends them. An agent cannot add a notification provider. An admin adds providers and their credentials in the portal. See [Notification providers](/docs/operate/notifications/).

## Subscribers

| Tool                      | Permission           | What it does                                                                                   |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `list_subscribers`        | `subscribers.read`   | List the webhook, email and text message subscribers, with their service choice.               |
| `add_subscriber`          | `subscribers.manage` | Add a confirmed subscriber: an email address, an `https` webhook URL or an E.164 phone number. |
| `set_subscriber_services` | `subscribers.manage` | Set the services that notify one subscriber. An empty list means every service.                |
| `remove_subscriber`       | `subscribers.manage` | Remove a subscriber.                                                                           |

A subscriber can choose the services that send a notification. Pass `serviceIds` to `add_subscriber`, or call `set_subscriber_services`. An empty list sends a notification for every service.

When you delete a service, the choice of each subscriber loses that service. A choice with no services left sends a notification for every service.
