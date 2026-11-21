---
title: Agent permissions
navTitle: Agent permissions
description: The permissions that an agent can hold, the member role for each permission, and how Incident Command limits and records agent actions.
order: 2
---

Each agent has its own permissions. The MCP server lists a tool only when the agent has the permission for that tool. [MCP tools](/docs/agents/tools/) gives the permission for each tool.

An admin sets the permissions of an agent on its page in the portal: open **Agents**, then select the agent. An agent with `agents.manage` can set them with the `update_agent` tool.

## Default permissions

A new agent gets three permissions: `status.read`, `drafts.read` and `drafts.write`. It can read the status page and write notification drafts. It cannot publish or notify subscribers. A person approves each draft.

These defaults apply to each new agent:

- An agent that a member creates on the OAuth consent page.
- An agent that an admin creates with **New agent**. The form selects the defaults first. The admin can change them.
- An agent that `create_agent` creates without a `permissions` value.

## Permission table

The **Minimum role** column gives the member role that has the permission in the portal. A member with that role or a higher role has the permission. The roles are Viewer, Editor and Admin, from low to high. See [Portal tour and roles](/docs/guide/portal/).

The portal shows each permission with its label. The tools and the API use the key in the first column.

| Permission            | Portal label                      | Minimum role | What it allows                                                                                        | Agent can hold it |
| --------------------- | --------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | ----------------- |
| `status.read`         | Read status                       | Viewer       | Read the status, services, regions and incidents.                                                     | Yes               |
| `drafts.read`         | Read drafts                       | Viewer       | Read notification drafts.                                                                             | Yes               |
| `drafts.write`        | Write drafts                      | Editor       | Write notification drafts for review by a person.                                                     | Yes               |
| `incidents.publish`   | Publish incidents and maintenance | Editor       | Declare, update and resolve incidents. Schedule maintenance.                                          | Yes               |
| `notifications.send`  | Notify subscribers                | Editor       | Send email, text messages and webhooks when the agent publishes. It requires `incidents.publish`.     | Yes               |
| `drafts.review`       | Review drafts                     | Editor       | Change, approve or discard a notification draft.                                                      | No                |
| `incidents.edit`      | Edit incidents                    | Editor       | Change the services, the regions or the maintenance window of an incident.                            | Yes               |
| `incidents.delete`    | Delete incidents                  | Editor       | Remove incidents and maintenance from the public view.                                                | Yes               |
| `services.write`      | Edit services                     | Editor       | Add and edit services and regions.                                                                    | Yes               |
| `services.set_status` | Set service status                | Editor       | Set the status of a service without an incident.                                                      | Yes               |
| `services.delete`     | Delete services                   | Editor       | Delete services and regions.                                                                          | Yes               |
| `members.read`        | Read members                      | Admin        | Read members and invites.                                                                             | Yes               |
| `members.manage`      | Manage members                    | Admin        | Invite, change and remove members.                                                                    | Yes               |
| `subscribers.read`    | Read subscribers                  | Admin        | Read subscribers.                                                                                     | Yes               |
| `subscribers.manage`  | Manage subscribers                | Admin        | Add, change and remove subscribers.                                                                   | Yes               |
| `settings.read`       | Read settings                     | Admin        | Read the settings and the branding.                                                                   | Yes               |
| `settings.write`      | Change settings                   | Admin        | Change the settings, the theme, the custom CSS, the logo, the favicon and the two-factor requirement. | Yes               |
| `channels.read`       | Read notification channels        | Admin        | Read the notification channels and their providers, without credentials.                              | Yes               |
| `channels.write`      | Change notification channels      | Admin        | Turn a channel on or off. Set its delivery strategy or its sender.                                    | Yes               |
| `channels.providers`  | Change notification providers     | Admin        | Add notification providers and their credentials.                                                     | No                |
| `agents.read`         | Read agents                       | Admin        | Read agents, their credentials and their activity.                                                    | Yes               |
| `agents.manage`       | Manage agents                     | Admin        | Create, change and delete agents. Create and revoke their tokens.                                     | Yes               |

## Person-only permissions

Two permissions are only for people. An agent cannot hold them:

- `drafts.review`: an agent cannot change, approve or discard a draft. A person reviews each draft. See [Review notification drafts](/docs/guide/drafts/).
- `channels.providers`: an agent cannot add notification providers or read their credentials. An admin adds providers and credentials in the portal. See [Notification providers](/docs/operate/notifications/).

## Rules for a change to permissions

- `notifications.send` requires `incidents.publish`. The portal and the tools refuse `notifications.send` without it.
- A person or an agent can give only the permissions that they have. An agent with `agents.manage` cannot give a permission that it does not have.
- An unknown permission causes an error.
- To change permissions, a person or an agent must have `agents.manage`.
- The owner of an agent can change its name and description. The owner is the member who created the agent on the OAuth consent page.
- `update_agent` needs the current `revision` of the agent. If somebody changed the agent before you, the call gets a `conflict` error.

## Effective permissions

The permissions that an agent uses in a request are its effective permissions. They depend on the credential:

- **OAuth connection:** the agent acts as the member who selected **Allow**. Its effective permissions are the agent permissions that the role of that member also has.
- **API token:** the token is not linked to a member. The agent uses all of its permissions.

For example, an agent has `settings.write`. An editor connects it with OAuth. Through that connection, the agent cannot change settings, because an editor does not have `settings.write`. When an admin connects the same agent, the agent can change settings.

The server calculates the effective permissions for each request. Thus a new role of the member applies immediately. The `whoami` tool returns the effective permissions and the credential type, `oauth` or `token`.

## Permissions that give full control

The portal shows this text next to `members.manage` and `agents.manage`: "An agent with this permission can give itself full control."

- With `members.manage`, an agent can invite a new admin, or change the role or the password of a member.
- With `agents.manage`, an agent can create a token for a different agent that has more permissions.

Give these permissions only to an agent that you trust as an admin.

Also give `settings.write` with care. The public status page shows a new design immediately, without a review by a person. The same permission also controls the two-factor requirement for members.

## Attribution

Incident Command records the author of each change. For a change by an agent, `author.type` is `agent`. The portal timeline shows the author name:

- Through OAuth, the author name is `<member> via <agent>`.
- Through an API token, the author name is the name of the agent.

When an agent deletes an incident, the portal keeps the record, the agent and the reason. When a person approves a draft, the published update shows that person as the author.

## Activity log

The **Agents** page shows the recent activity of all agents. Each agent page shows the full activity log of that agent. The log records these events:

- Each tool call that changes data.
- Each tool call that fails, and each call to a tool that the agent cannot use (`denied`).
- New and revoked API tokens.
- OAuth connections and disconnections.
- A new agent, a new name, new permissions, and the removal of the owner.
- The decision of a person about a draft of the agent: approve or discard.

The log does not record a read call that succeeds. It never holds a secret. When an agent uploads a logo or a favicon, the log records which file changed, but not the file.

## Notifications

These tools notify subscribers by default: `create_incident`, `post_incident_update`, `resolve_incident` and `schedule_maintenance`. To prevent the notification, pass `notify: false`.

An agent notifies subscribers only when it has `notifications.send`. Without that permission, the agent has two options:

- Pass `notify: false`. Otherwise the call fails with a `forbidden` error.
- Use `draft_notification`. A person approves the draft, and the approval notifies subscribers. See [Agent workflows](/docs/agents/workflows/#notification-drafts-with-human-review).

## Agents from an earlier release

A release before agent permissions used tokens and connections with member roles. At startup, Incident Command makes an agent for each old token and each old OAuth connection. The new agent gets the permissions of the old role, except `notifications.send`.

The page of such an agent shows this text: "This agent existed before permissions. It kept its access, but it cannot notify subscribers. Examine its permissions." Examine the permissions, and then save them. The text then goes away.
