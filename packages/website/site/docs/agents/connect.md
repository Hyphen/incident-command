---
title: Connect an agent
navTitle: Connect an agent
description: Connect an AI agent to the Incident Command MCP server with an OAuth 2.1 sign-in, or with an API token for a script.
order: 1
---

Incident Command has a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. An AI agent uses it to declare and update incidents, change the status of a service and schedule maintenance. With more permissions, an agent can also manage members, agents, subscribers and settings, and design the status page.

Each agent has its own permissions. An agent sees only the tools that its permissions allow. See [Agent permissions](/docs/agents/permissions/) and [MCP tools](/docs/agents/tools/).

## The MCP endpoint

- **Endpoint:** `POST https://<your-host>/api/mcp`
- **Transport:** Streamable HTTP, stateless. Each request is independent. Thus the endpoint scales horizontally and runs on serverless hosts.
- **Methods:** Use only `POST`. A `GET` or `DELETE` request gets `405` and the header `Allow: POST`.
- **Authentication:** OAuth 2.1 (recommended), or an API token for a script that cannot sign in.

The **Agents** page in the portal shows the endpoint and a button that copies it. The endpoint uses the site URL from the settings. Without a site URL, it uses the host of the request. See [Settings](/docs/guide/settings/).

![The Agents page in the portal, with the MCP endpoint, the agents and the recent activity](/images/manage-agents.png)

The examples on this page use `https://status.example.com`. Replace it with the URL of your status page.

### Read the status without credentials

An agent that only reads the status does not need credentials:

- `GET /llms.txt` gives the public status page in Markdown.
- `GET /incidents/{id}.md` gives one incident page in Markdown.

See [Public endpoints](/docs/reference/public-endpoints/) for the other public pages.

## Connect with OAuth

OAuth is the recommended method. The agent registers itself, and a member of the portal approves it in the browser.

1. Add the endpoint to your agent. See [Client examples](#client-examples).
2. Start the agent. At the first connection, the agent opens the portal consent page (`/manage/authorize`) in your browser.
3. Sign in to the portal, if necessary.
4. Select **New agent**, or select **Existing agent** and then an agent in the list.
5. For a new agent, change the **Agent name** if necessary.
6. Select **Allow**. To refuse the connection, select **Cancel**.

The agent then calls the MCP server as you. In Claude Code, run `/mcp` and select the server to start the sign-in again.

Read the consent page before you select **Allow**:

- The agent supplies the client name on the page. Allow the agent only if you started this connection.
- The page shows the address that your browser goes to after your decision.
- The agent list shows the agents that you own. An admin sees all agents and can attach the connection to each of them.
- Each agent in the list shows the permissions that it gets through your role.

A new agent gets three permissions: `status.read`, `drafts.read` and `drafts.write`. It can read the status page and write drafts. It cannot publish or notify subscribers. An admin can change its permissions on the agent page.

Your role limits what the agent can do through your connection. See [Effective permissions](/docs/agents/permissions/#effective-permissions).

## Client examples

### Claude Code with OAuth

```bash
claude mcp add --transport http incident-command https://status.example.com/api/mcp
```

### Other clients with OAuth

Use this configuration in a client that supports remote MCP servers:

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

### Claude Code with an API token

```bash
claude mcp add --transport http incident-command https://status.example.com/api/mcp --header "Authorization: Bearer icmd_..."
```

### Other clients with an API token

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

### Plain HTTP with an API token

```bash
curl -s https://status.example.com/api/mcp \
  -H "Authorization: Bearer icmd_..." \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_status","arguments":{}}}'
```

## OAuth endpoints

The server is an OAuth 2.1 authorization server for its MCP endpoint, as the MCP authorization specification describes. An agent finds these endpoints itself. You do not need to configure them.

| Endpoint                                 | Path                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Protected resource metadata (RFC 9728)   | `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-protected-resource` |
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server`                                                   |
| Dynamic client registration (RFC 7591)   | `POST /oauth/register`                                                                      |
| Authorization (the consent page)         | `GET /manage/authorize`                                                                     |
| Token                                    | `POST /oauth/token`                                                                         |

These rules apply to an OAuth connection:

- A request without a valid token gets `401` and the header `WWW-Authenticate: Bearer resource_metadata="…"`. The agent uses this address to find the other endpoints. For a token that is not valid, the header also has `error="invalid_token"`.
- Each client is a public client without a secret. PKCE with `S256` is necessary.
- The grant types are `authorization_code` and `refresh_token`. The response type is `code`.
- A redirect URI uses `https`, `http` on `localhost`, `127.0.0.1` or `[::1]` (any port), or a private-use scheme such as `cursor://`. A redirect URI cannot have a fragment.
- A client registers 1 to 10 redirect URIs.
- The optional `resource` parameter (RFC 8707) must be the MCP endpoint or its origin.
- An authorization code is valid for 10 minutes. It works one time.
- An access token is valid for 1 hour. Each refresh replaces the access token and the refresh token.
- If the agent does not refresh its token in 30 days, the connection stops. Connect the agent again.
- The server removes a registered client when no member approves it in 30 days.
- The store keeps only SHA-256 hashes of codes and tokens.

## Manage connections

Each member sees their connected agents on the **Agents** page and can disconnect them. An admin sees all connected agents and can disconnect each of them. A disconnected agent stops immediately.

When an admin removes a member, or resets the password of a member, all OAuth connections of that member stop. The agents stay, but they have no owner after that. An API token does not stop, because it is not linked to a member.

## API tokens

Use an API token for a script or an agent that cannot sign in. Only an admin can create a token.

1. In the portal, open **Agents** and select **New agent**.
2. Enter a name and, if necessary, a description.
3. Select the permissions. See [Agent permissions](/docs/agents/permissions/).
4. Select **Create agent**.
5. On the agent page, go to **Credentials**.
6. In **Expires in (days)**, enter a number of days. For a token that does not expire, leave the field empty.
7. Select **Create token**.
8. Copy the token immediately. The page shows it one time.

A token starts with `icmd_`. The store keeps only a SHA-256 hash of the token. The agent page shows only the first characters, the expiry date and the time of the last use.

The agent sends the token in the `Authorization` header, as `Bearer icmd_...`. To stop a token, select **Revoke** on the **Agents** page or on the agent page. The token stops immediately.

An agent with `agents.manage` can also create and revoke tokens with the `create_agent_token` and `revoke_agent_token` tools. The same tokens also work with the subscriber endpoints of the [REST API](/api/).
