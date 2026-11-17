# MCP server

Incident Command ships a [Model Context Protocol](https://modelcontextprotocol.io) server so AI agents can run the whole thing: declare and update incidents, change service status, schedule maintenance, and (with an admin token) manage members, tokens, subscribers and settings.

- **Endpoint:** `POST https://<your-host>/api/mcp`
- **Transport:** Streamable HTTP, stateless (every request is independent, so it scales horizontally and runs on serverless hosts). `GET`/`DELETE` return `405`.
- **Auth:** OAuth 2.1 (recommended) or an API token. See [Connect](#connect).

## Connect

Add the endpoint to your agent. The **Agents** page in the portal shows the endpoint.

Claude Code:

```bash
claude mcp add --transport http incident-command https://status.example.com/api/mcp
```

Any client that supports remote MCP servers:

```json
{
	"mcpServers": {
		"incident-command": {
			"type": "http",
			"url": "https://status.example.com/api/mcp"
		}
	}
}
```

At the first connection, the agent opens the portal in your browser. Sign in. Choose a new agent or an existing agent. Select **Allow**. A new agent can read the status page and write drafts. It cannot publish or notify subscribers. An admin can change its permissions. In Claude Code, run `/mcp` and select the server to start the sign-in again.

### OAuth

The server is an OAuth 2.1 authorization server for its MCP endpoint, as the MCP authorization specification describes.

| Endpoint                                 | Path                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Protected resource metadata (RFC 9728)   | `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-protected-resource` |
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server`                                                   |
| Dynamic client registration (RFC 7591)   | `POST /oauth/register`                                                                      |
| Authorization (the consent page)         | `GET /manage/authorize`                                                                     |
| Token                                    | `POST /oauth/token`                                                                         |
- A request without a valid token gets `401` and `WWW-Authenticate: Bearer resource_metadata="…"`. The agent uses this address to find the other endpoints.
- Each client is a public client without a secret. PKCE with `S256` is necessary.
- A redirect URI uses `https`, `http` on `localhost`, `127.0.0.1` or `[::1]` (any port), or a private-use scheme such as `cursor://`.
- An access token is valid for 1 hour. Each refresh replaces the access token and the refresh token. If the agent does not refresh in 30 days, the connection stops.
- A connected agent uses the permissions of that agent. The role of the member limits those permissions. The portal timeline shows its updates as `<member> via <agent>`.
- Each member sees their connected agents on the **Agents** page and can disconnect them. An admin sees all connected agents and can disconnect each of them.
- When an admin removes a member or resets the password of a member, the agents of that member stop.
- The store keeps only SHA-256 hashes of codes and tokens.

### API tokens

Use an API token for a script or an agent that cannot sign in. An admin creates the agent, then creates the token on the agent page. The page shows the plaintext token one time. The store keeps only a SHA-256 hash. The agent sends the token in the `Authorization` header.

Claude Code:

```bash
claude mcp add --transport http incident-command https://status.example.com/api/mcp --header "Authorization: Bearer icmd_..."
```

Any client that supports remote MCP servers:

```json
{
	"mcpServers": {
		"incident-command": {
			"type": "http",
			"url": "https://status.example.com/api/mcp",
			"headers": { "Authorization": "Bearer icmd_..." }
		}
	}
}
```

Plain HTTP:

```bash
curl -s https://status.example.com/api/mcp \
  -H "Authorization: Bearer icmd_..." \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_status","arguments":{}}}'
```

## Permissions

Each agent has its own permissions. A tool is listed only when the agent has the permission for that tool. A new agent can read the status page and write drafts. It cannot publish or notify subscribers.

| Permission            | What it allows                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `status.read`         | Read status, services and incidents.                                                       |
| `drafts.read`         | Read notification drafts.                                                                  |
| `drafts.write`        | Write notification drafts.                                                                 |
| `incidents.publish`   | Publish incidents and maintenance.                                                         |
| `notifications.send`  | Notify subscribers when the agent publishes. This permission requires `incidents.publish`. |
| `incidents.edit`      | Edit incidents.                                                                            |
| `incidents.delete`    | Delete incidents.                                                                          |
| `services.write`      | Edit services.                                                                             |
| `services.set_status` | Set a service status.                                                                      |
| `services.delete`     | Delete services.                                                                           |
| `members.read`        | Read members and invites.                                                                  |
| `members.manage`      | Invite, change and remove members.                                                         |
| `subscribers.read`    | Read subscribers.                                                                          |
| `subscribers.manage`  | Add and remove subscribers.                                                                |
| `settings.read`       | Read settings.                                                                             |
| `settings.write`      | Change settings.                                                                           |
| `channels.read`       | Read notification channels.                                                                |
| `channels.write`      | Change notification channels.                                                              |
| `agents.read`         | Read agents and their activity.                                                            |
| `agents.manage`       | Create and change agents and their tokens.                                                 |

A person reviews drafts. An agent cannot approve a draft. An agent cannot change notification providers.

## Tools

| Tool                          | Permission            | What it does                                                                        |
| ----------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `whoami`                      | none                  | The identity, permissions and credential type of the agent.                         |
| `get_status`                  | `status.read`         | Overall status, services with status and uptime, open incidents and maintenance.    |
| `list_services`               | `status.read`         | All services (including hidden) in display order.                                   |
| `list_incidents`              | `status.read`         | Incidents and maintenance, newest first. Filter by `kind` and `open`.               |
| `get_incident`                | `status.read`         | One incident with its full timeline.                                                |
| `create_service`              | `services.write`      | Add a service.                                                                      |
| `update_service`              | `services.write`      | Edit a service (`null` clears description or group).                                |
| `set_service_status`          | `services.set_status` | Change a service's status without an incident. Feeds uptime history.                |
| `delete_service`              | `services.delete`     | Delete a service and its status history.                                            |
| `create_incident`             | `incidents.publish`   | Declare an incident. Affected services move to a status derived from the impact.    |
| `post_incident_update`        | `incidents.publish`   | Add a timeline update, optionally changing status and service status.               |
| `resolve_incident`            | `incidents.publish`   | Resolve an incident or complete maintenance; restores affected services.            |
| `edit_incident`               | `incidents.edit`      | Change title, impact, services or the maintenance window without posting an update. |
| `delete_incident`             | `incidents.delete`    | Delete an incident or maintenance.                                                  |
| `schedule_maintenance`        | `incidents.publish`   | Announce planned maintenance with a window.                                         |
| `draft_notification`          | `drafts.write`        | Save a notification for review by a person. Returns the `reviewUrl`.                |
| `get_notification_draft`      | `drafts.read`         | One notification draft and its review state.                                        |
| `list_members`                | `members.read`        | Portal members.                                                                     |
| `invite_member`               | `members.manage`      | Create a one-time `inviteUrl` (valid for 7 days). The person creates their account. |
| `list_invites`                | `members.read`        | Invites that nobody used yet.                                                       |
| `revoke_invite`               | `members.manage`      | Remove an invite. Its link stops working.                                           |
| `update_member`               | `members.manage`      | Change name, email, role or password.                                               |
| `remove_member`               | `members.manage`      | Remove a member (the last admin cannot be removed).                                 |
| `list_agents`                 | `agents.read`         | Agents, their permissions and their credentials.                                    |
| `create_agent_token`          | `agents.manage`       | Create a token for an agent. The token is returned once.                            |
| `revoke_agent_token`          | `agents.manage`       | Revoke a token immediately.                                                         |
| `create_agent`                | `agents.manage`       | Create an agent.                                                                    |
| `update_agent`                | `agents.manage`       | Change the name, description or permissions.                                        |
| `delete_agent`                | `agents.manage`       | Delete an agent and its credentials.                                                |
| `list_agent_activity`         | `agents.read`         | Recent activity for one agent.                                                      |
| `get_settings`                | `settings.read`       | Status page settings and branding.                                                  |
| `update_settings`             | `settings.write`      | Change name, URLs, theme, brand color, CSS and uptime.                              |
| `get_notification_settings`   | `channels.read`       | The webhook, email and text messaging channels and their providers. No credentials. |
| `update_notification_channel` | `channels.write`      | Turn a channel on or off, or set its delivery strategy or sender.                   |
| `list_subscribers`            | `subscribers.read`    | Webhook, email and text message subscribers.                                        |
| `add_subscriber`              | `subscribers.manage`  | Add a confirmed email subscriber, a webhook or an E.164 phone number.               |
| `remove_subscriber`           | `subscribers.manage`  | Remove a subscriber.                                                                |

Agents cannot add notification providers or read their credentials. An admin adds providers and credentials in the portal.

Results are JSON in a text content block. Expected failures (validation, not found, permission) come back as tool errors with `isError: true` and a message such as `not_found: Incident "inc_123" was not found`; unexpected failures return `internal_error` without leaking details.

## How incidents affect services

| Event                                     | Affected services become                                 |
| ----------------------------------------- | -------------------------------------------------------- |
| Incident created, impact `minor`          | `degraded_performance`                                   |
| Incident created, impact `major`          | `partial_outage`                                         |
| Incident created, impact `critical`       | `major_outage`                                           |
| Incident created, impact `none`           | unchanged                                                |
| Maintenance moves to `in_progress`        | `under_maintenance`                                      |
| Incident resolved / maintenance completed | `operational`, unless another open incident affects them |
| Any update with `serviceStatus`           | exactly `serviceStatus`                                  |

Every status change is recorded and drives the 90-day uptime bars. Partial outages count as 30% downtime, major outages as 100%; degraded performance and maintenance do not count as downtime.

## Notification drafts

Use a notification draft when a person must approve a notification before subscribers get it.

1. The agent calls `draft_notification`. Without `incidentId`, the draft declares a new incident or maintenance. With `incidentId`, the draft is an update to that incident.
2. The tool returns a `reviewUrl`, for example `https://status.example.com/manage/drafts/drf_...`. The agent gives this link to a person.
3. The person opens the link and signs in, if necessary. The portal then shows the draft. An editor can change the title, status, impact, message, services and maintenance window.
4. The editor selects **Save draft** to keep the changes, or **Approve and send** to publish the draft. Approval publishes the update on the status page and notifies subscribers. **Discard draft** closes the draft and sends nothing.
5. The agent calls `get_notification_draft` to read the result. The `state` is `pending`, `approved` or `discarded`. After approval, `incidentId` is the incident that has the published update.

The status page and subscribers see nothing until a person approves the draft. The service checks a draft with the same rules as `create_incident`, `schedule_maintenance` and `post_incident_update`. Thus, an approved draft does not fail because of invalid input. The published update shows the editor who approved it as the author. Only one review of a draft can succeed. If two editors review a draft at the same time, the second review gets a `conflict` error.

For safe retries, pass a UUID in `requestId` to `draft_notification`. Use a new UUID for each draft. With the same agent and UUID, a retry returns the first draft, including any review decision. After approval, `draft.publishedAt` tells you when the status page received the update.

An agent publishes only when it has `incidents.publish`. It notifies subscribers only when it has `notifications.send`. Without that permission, pass `notify: false` or use `draft_notification`.

## Attribution and notifications

Updates are attributed to the agent (`author.type = "agent"`), visible in the portal timeline. Creating and updating incidents notifies subscribers unless you pass `notify: false`.
