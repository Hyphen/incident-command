# MCP server

Incident Command ships a [Model Context Protocol](https://modelcontextprotocol.io) server so AI agents can run the whole thing: declare and update incidents, change service status, schedule maintenance, and (with an admin token) manage members, tokens, subscribers and settings. An agent can also [design the status page](#design-the-status-page).

- **Endpoint:** `POST https://<your-host>/api/mcp`
- **Transport:** Streamable HTTP, stateless (every request is independent, so it scales horizontally and runs on serverless hosts). `GET`/`DELETE` return `405`.
- **Auth:** OAuth 2.1 (recommended) or an API token. See [Connect](#connect).
- **Read without credentials:** `GET /llms.txt` gives the public status page in Markdown. Each incident page has a Markdown version at `/incidents/{id}.md`. Use these pages when an agent only reads the status.

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
| `subscribers.manage`  | Add, change and remove subscribers.                                                        |
| `settings.read`       | Read settings.                                                                             |
| `settings.write`      | Change settings.                                                                           |
| `channels.read`       | Read notification channels.                                                                |
| `channels.write`      | Change notification channels.                                                              |
| `agents.read`         | Read agents and their activity.                                                            |
| `agents.manage`       | Create and change agents and their tokens.                                                 |

A person reviews drafts. An agent cannot approve a draft. An agent cannot change notification providers.

## Regions

Global is the default region. It is not a record.

Call `list_regions` before you set a region.

Pass `regionId` to `create_incident`, `schedule_maintenance`, `draft_notification`, or `edit_incident`.

Pass `null` to `edit_incident` to move an incident to Global.

Pass `regionId` to `get_status` to read one region.

With no regions, the status page is one page.

With regions, the page shows Global and a tab for each region.

A region tab shows only that region.

Delete a region and its incidents move to Global.

## Tools

| Tool                          | Permission            | What it does                                                                                 |
| ----------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `whoami`                      | none                  | The identity, permissions and credential type of the agent.                                  |
| `get_status`                  | `status.read`         | Overall status, services with status and uptime, open incidents and maintenance.             |
| `list_services`               | `status.read`         | All services (including hidden) in display order.                                            |
| `list_incidents`              | `status.read`         | Incidents and maintenance, newest first. Filter by `kind` and `open`.                        |
| `get_incident`                | `status.read`         | One incident with its full timeline. Each update has the title and the impact.               |
| `create_service`              | `services.write`      | Add a service.                                                                               |
| `update_service`              | `services.write`      | Edit a service (`null` clears description or group).                                         |
| `set_service_status`          | `services.set_status` | Change a service's status without an incident. Feeds uptime history.                         |
| `delete_service`              | `services.delete`     | Delete a service and its status history.                                                     |
| `list_regions`                | `status.read`         | Named regions in display order. Global is not in the list.                                   |
| `create_region`               | `services.write`      | Add a named region. The status page then shows a tab for it.                                 |
| `update_region`               | `services.write`      | Rename a region or change its display order.                                                 |
| `delete_region`               | `services.delete`     | Delete a region. Incidents in that region move to Global.                                    |
| `create_incident`             | `incidents.publish`   | Declare an incident. Pass `regionId` to select a region. Omit it for Global.                 |
| `post_incident_update`        | `incidents.publish`   | Add a timeline update. It records the title and the impact, and it can change them.          |
| `resolve_incident`            | `incidents.publish`   | Resolve an incident or complete maintenance; restores affected services.                     |
| `edit_incident`               | `incidents.edit`      | Replace the service list, or change the window or the region. It does not change the title.  |
| `delete_incident`             | `incidents.delete`    | Delete an incident from the public view. The portal keeps the reason.                        |
| `schedule_maintenance`        | `incidents.publish`   | Announce planned maintenance with a window.                                                  |
| `draft_notification`          | `drafts.write`        | Save a notification for review by a person. Returns the `reviewUrl`.                         |
| `get_notification_draft`      | `drafts.read`         | One notification draft and its review state.                                                 |
| `list_members`                | `members.read`        | Portal members.                                                                              |
| `invite_member`               | `members.manage`      | Create a one-time `inviteUrl` (valid for 7 days). The person creates their account.          |
| `list_invites`                | `members.read`        | Invites that nobody used yet.                                                                |
| `revoke_invite`               | `members.manage`      | Remove an invite. Its link stops working.                                                    |
| `update_member`               | `members.manage`      | Change name, email, role or password.                                                        |
| `remove_member`               | `members.manage`      | Remove a member (the last admin cannot be removed).                                          |
| `list_agents`                 | `agents.read`         | Agents, their permissions and their credentials.                                             |
| `create_agent_token`          | `agents.manage`       | Create a token for an agent. The token is returned once.                                     |
| `revoke_agent_token`          | `agents.manage`       | Revoke a token immediately.                                                                  |
| `create_agent`                | `agents.manage`       | Create an agent.                                                                             |
| `update_agent`                | `agents.manage`       | Change the name, description or permissions.                                                 |
| `delete_agent`                | `agents.manage`       | Delete an agent and its credentials.                                                         |
| `list_agent_activity`         | `agents.read`         | Recent activity for one agent.                                                               |
| `get_settings`                | `settings.read`       | Status page settings and branding, with `logoUrl` and `faviconUrl`.                          |
| `get_design_guide`            | `settings.write`      | The theme presets, design tokens, CSS selectors, rules and limits for a design.              |
| `update_settings`             | `settings.write`      | Change name, URLs, theme, CSS, uptime, the "Powered by" line and the two-factor requirement. |
| `upload_brand_asset`          | `settings.write`      | Store the logo or the favicon. It replaces the stored file.                                  |
| `remove_brand_asset`          | `settings.write`      | Remove the stored logo or favicon.                                                           |
| `get_notification_settings`   | `channels.read`       | The webhook, email and text messaging channels and their providers. No credentials.          |
| `update_notification_channel` | `channels.write`      | Turn a channel on or off, or set its strategy or sender. Webhooks have neither.              |
| `list_subscribers`            | `subscribers.read`    | Webhook, email and text message subscribers, with the service choice.                        |
| `add_subscriber`              | `subscribers.manage`  | Add a confirmed subscriber. `serviceIds` limits the notices.                                 |
| `set_subscriber_services`     | `subscribers.manage`  | Set the services that notify one subscriber. An empty list means every service.              |
| `remove_subscriber`           | `subscribers.manage`  | Remove a subscriber.                                                                         |

A subscriber can choose the services that send a notification. Pass `serviceIds` to `add_subscriber`, or call `set_subscriber_services`. An empty list sends a notification for every service. Delete a service. The choice then loses that service. A choice with no services left sends a notification for every service.

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
| Update with a new `impact`                | unchanged                                                |
| Any update with `serviceStatus`           | exactly `serviceStatus`                                  |
| Any update with `serviceStatuses`         | the status in its entry, for each service in the list    |
| Update with `serviceIds`                  | adds those services at the status of the update          |

`create_incident`, `post_incident_update` and `draft_notification` accept `serviceStatuses`. Use it to give each affected service a different status. Each entry replaces `serviceStatus` and the automatic status for its service only. The other affected services keep `serviceStatus` or the automatic status.

```json
{
	"id": "inc_123",
	"message": "The API is back. The dashboard is still slow.",
	"serviceStatuses": [
		{ "serviceId": "svc_api", "status": "operational" },
		{ "serviceId": "svc_dashboard", "status": "degraded_performance" }
	]
}
```

Each service in `serviceStatuses` must be an affected service, or a service that this update adds. For a new incident, put the service in `serviceIds`. For an update, put a new service in `serviceIds` too.

An update adds the services in `serviceIds`. A service that is already affected stays on the incident. A new service gets `serviceStatus` when you set it. It gets its own entry in `serviceStatuses` when you give one.

With no status in the update, a new service follows the impact, as a new incident does. When maintenance is in progress or verifying, the new service becomes `under_maintenance`. An update of a resolved incident leaves the new service as it is.

`edit_incident` replaces the full service list. That edit does not change a service status. It does not change the title or the impact. Use `post_incident_update` for the title and the impact.

An entry also applies when a different open incident affects the service. Thus, when you resolve an incident, do not list a service that must go back to `operational`. Resolution restores that service, but keeps it as it is while a different open incident affects it.

A new impact on an update does not change a service that the incident already affects. A service that the update adds follows that impact.

Every status change is recorded and drives the 90-day uptime bars. Partial outages count as 30% downtime, major outages as 100%; degraded performance and maintenance do not count as downtime.

## Notification drafts

Use a notification draft when a person must approve a notification before subscribers get it.

1. The agent calls `draft_notification`. Without `incidentId`, the draft declares a new incident or maintenance. With `incidentId`, the draft is an update to that incident.
2. The tool returns a `reviewUrl`, for example `https://status.example.com/manage/drafts/drf_...`. The agent gives this link to a person.
3. The person opens the link and signs in, if necessary. The portal then shows the draft. An editor can change the title, status, impact, message, services, the status of each service and the maintenance window.
4. The editor selects **Save draft** to keep the changes, or **Approve and send** to publish the draft. Approval publishes the update on the status page and notifies subscribers. **Discard draft** closes the draft and sends nothing.
5. The agent calls `get_notification_draft` to read the result. The `state` is `pending`, `approved` or `discarded`. After approval, `incidentId` is the incident that has the published update.

The status page and subscribers see nothing until a person approves the draft. The service checks a draft with the same rules as `create_incident`, `schedule_maintenance` and `post_incident_update`. Thus, an approved draft does not fail because of invalid input. The published update shows the editor who approved it as the author. Only one review of a draft can succeed. If two editors review a draft at the same time, the second review gets a `conflict` error.

For safe retries, pass a UUID in `requestId` to `draft_notification`. Use a new UUID for each draft. With the same agent and UUID, a retry returns the first draft, including any review decision. After approval, `draft.publishedAt` tells you when the status page received the update.

An agent publishes only when it has `incidents.publish`. It notifies subscribers only when it has `notifications.send`. Without that permission, pass `notify: false` or use `draft_notification`.

## Design the status page

An agent that has `settings.read` and `settings.write` can do the full design of the status page. It selects a theme, uploads the logo and the favicon, and writes custom CSS.

1. The agent calls `get_design_guide`. The result lists the theme presets, the design tokens, the CSS selectors, the rules, the limits and an example stylesheet.
2. The agent calls `update_settings` with `theme`.
3. The agent calls `upload_brand_asset` for the logo and for the favicon.
4. The agent calls `update_settings` with `customCss` for all other changes, such as the brand color in `--ic-brand`.

`upload_brand_asset` takes a `kind` (`logo` or `favicon`) and the file in `data`. The `data` value is one of these:

- The file as base64 text.
- A base64 data URL, such as `data:image/png;base64,iVBORw0…`.
- The source text of an SVG image, such as `<svg xmlns="http://www.w3.org/2000/svg" …>`.

```json
{
	"kind": "logo",
	"data": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 32\"><text x=\"0\" y=\"24\" font-size=\"24\">Acme</text></svg>"
}
```

The rules for a file are the same as in the portal. The maximum size of a file is 512 KB. A logo is a PNG, JPEG, WebP, GIF or SVG file. A favicon can also be an ICO file. An SVG file cannot contain a script or an event handler. The tool does not download a file from a URL.

The result of `get_settings`, `update_settings`, `upload_brand_asset` and `remove_brand_asset` has `logoUrl` and `faviconUrl` when a file is stored. The activity log of the agent records which file changed. It does not record the file.

Set `showPoweredBy` to `false` to remove "Powered by Incident Command" from the public pages. Set it to `true` to show the line again. Do not hide the line with `customCss`.

A value of `customCss` replaces the stored stylesheet. Thus the agent must call `get_settings` first, then send the full stylesheet. Pass `null` to remove the stylesheet. [Theming](theming.md#2-custom-css) lists the tokens and the selectors that the stylesheet can use.

```json
{
	"theme": "carbon",
	"customCss": ":root:has(.ic-page) { --ic-brand: #7c5cff; --ic-radius: 1rem; }\n.ic-uptime-bar { border-radius: 9999px; }"
}
```

The public status page shows the new design without a review by a person. Give `settings.write` only to an agent that you trust with the look of the page.

## Attribution and notifications

Updates are attributed to the agent (`author.type = "agent"`), visible in the portal timeline. Creating and updating incidents notifies subscribers unless you pass `notify: false`.
