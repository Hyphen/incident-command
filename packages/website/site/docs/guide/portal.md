---
title: Portal tour and roles
navTitle: Portal tour and roles
description: Learn the pages of the manage portal at /manage and the tasks that viewers, editors and admins can do in it.
order: 1
---

The manage portal is at `/manage` on your status page. The members of your team sign in to the portal. In the portal, they declare incidents, post updates, change services and manage the status page.

To get an account, ask an admin for an invite link. See [Sign in and two-factor authentication](/docs/guide/account/).

![The Overview page of the portal, with the status, the uptime and the open incidents](/images/manage-overview.png)

## The sidebar

The sidebar is on the left side of each portal page. On a small screen, the sidebar is at the top of the page. The sidebar shows only the pages that your role can open.

| Item                 | What the page shows                                                                                     | Lowest role |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| **Overview**         | The status, the uptime, the open incidents and the incident metrics.                                    | Viewer      |
| **Incidents**        | The open, resolved and deleted incidents and maintenance. The notification drafts that wait for review. | Viewer      |
| **Services**         | The services on the status page and the status of each service.                                         | Viewer      |
| **Regions**          | The named regions that split the status page into tabs.                                                 | Viewer      |
| **Members**          | The members of your team and the open invites.                                                          | Admin       |
| **Agents**           | The agents that use the status page through MCP.                                                        | Viewer      |
| **Subscribers**      | The email addresses, phone numbers and webhooks that get notifications.                                 | Admin       |
| **Settings**         | The **General**, **Branding** and **Notifications** sections.                                           | Admin       |
| **View status page** | The public status page, in a new tab.                                                                   | Viewer      |

An editor and an admin also see each item for a viewer.

Your name, your email address and your role are at the bottom of the sidebar. Select them to open a menu with **My Profile** and **Sign out**. On **My Profile**, you change your password and set up two-factor authentication.

If you open a page that your role cannot use, the portal opens **Overview**. It shows a message, for example "That page requires the admin role".

## The Overview page

**Overview** is the first page after you sign in. It shows these items:

- **Current status**: the overall status of the status page.
- **Uptime**: the combined uptime of the visible services in the uptime window. Time before a service existed is not downtime.
- **Open incidents**: the number of open incidents, and the number of active and scheduled maintenance.
- **Services affected**: the services that are not operational.
- **Open incidents and maintenance**: a link to each open incident and each open maintenance.
- **Uptime**: the uptime for each period, for example 7, 30 and 90 days. A table shows the uptime of each service.
- **Last 30 days**: the number of incidents, the mean time to resolve and the longest incident.

When an agent writes a notification draft, a message shows the number of drafts that wait for review. Select **Review drafts →** to open the drafts. See [Review notification drafts](/docs/guide/drafts/).

Editors and admins also see the **Declare incident** and **Schedule maintenance** buttons. See [Incidents and maintenance](/docs/guide/incidents/).

## Roles

Each member has one role: viewer, editor or admin. An editor has all the permissions of a viewer. An admin has all the permissions of an editor. An admin sets the role of each member on the **Members** page.

- A **viewer** reads the portal. A viewer cannot change incidents, services, regions or settings.
- An **editor** manages incidents, maintenance, services and regions. An editor also reviews notification drafts.
- An **admin** also manages members, agents, subscribers and settings.

A new role applies to the next action of that member.

## What each role can do

The permission names in this table are the same names that agents use. See [Agent permissions](/docs/agents/permissions/).

| Task                                                           | Permission                               | Viewer | Editor | Admin |
| -------------------------------------------------------------- | ---------------------------------------- | ------ | ------ | ----- |
| Open **Overview**, **Incidents**, **Services** and **Regions** | `status.read`                            | Yes    | Yes    | Yes   |
| Read notification drafts                                       | `drafts.read`                            | Yes    | Yes    | Yes   |
| Declare incidents, schedule maintenance and post updates       | `incidents.publish`                      | No     | Yes    | Yes   |
| Notify subscribers when you post                               | `notifications.send`                     | No     | Yes    | Yes   |
| Save, approve or discard notification drafts                   | `drafts.review`                          | No     | Yes    | Yes   |
| Change the maintenance window and the regions of an incident   | `incidents.edit`                         | No     | Yes    | Yes   |
| Delete an incident from the public view                        | `incidents.delete`                       | No     | Yes    | Yes   |
| Add and edit services and regions                              | `services.write`                         | No     | Yes    | Yes   |
| Set the status of a service by hand                            | `services.set_status`                    | No     | Yes    | Yes   |
| Delete services and regions                                    | `services.delete`                        | No     | Yes    | Yes   |
| Invite members, change roles and remove members                | `members.read`, `members.manage`         | No     | No     | Yes   |
| Add and remove subscribers                                     | `subscribers.read`, `subscribers.manage` | No     | No     | Yes   |
| Change the **General** settings                                | `settings.general.read`, `settings.general.write` | No | No | Yes |
| Change the **Branding** settings                               | `settings.branding.read`, `settings.branding.write` | No | No | Yes |
| Turn notification channels on and off                          | `channels.read`, `channels.write`        | No     | No     | Yes   |
| Add, change and remove notification providers                  | `channels.providers`                     | No     | No     | Yes   |
| See all agents, and add agents and API tokens                  | `agents.read`, `agents.manage`           | No     | No     | Yes   |
| Change your password and your two-factor authentication        | None                                     | Yes    | Yes    | Yes   |
| Connect an agent with OAuth                                    | None                                     | Yes    | Yes    | Yes   |

On the **Agents** page, a viewer or an editor sees only the agents that the member connected. An agent that you connect cannot get more permissions than your role. See [Connect an agent](/docs/agents/connect/).

## Permissions for people only

Two permissions are for people only. An admin cannot give them to an agent.

- `drafts.review`: Only an editor or an admin can save, approve or discard a notification draft. Thus, a person always examines a draft before the status page shows it and subscribers get it.
- `channels.providers`: Only an admin can add, change, move or remove a notification provider. An agent cannot change the provider credentials.

## Messages at the top of a page

After each action, a message at the top of the page tells you the result. For example, "Service saved" or "Check the form and try again."

If the database is not available, each page shows a message about it. The status page then shows the last data that it read. You cannot save changes until the database is available again.

After an upgrade, a portal page that you opened before the upgrade can show "This page is out of date" one time. Reload the page. See [Secrets and key rotation](/docs/operate/secrets/).
