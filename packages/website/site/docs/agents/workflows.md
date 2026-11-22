---
title: Agent workflows
navTitle: Agent workflows
description: Common agent tasks with the MCP server, such as notification drafts with human review, regions, service status rules and status page design.
order: 4
---

This page describes the common tasks of an agent. Each task gives the tools that the agent calls. [MCP tools](/docs/agents/tools/) gives the permission for each tool.

## Incidents and maintenance

An agent calls `get_status` first to read the current state. Then it uses these tools:

- `create_incident` declares an incident.
- `post_incident_update` adds an update. The status of an incident goes from `investigating` to `identified`, `monitoring` and `resolved`.
- `resolve_incident` closes the incident.
- `schedule_maintenance` announces planned work. The status of maintenance goes from `scheduled` to `in_progress`, `verifying` and `completed`.

Each update records the title and the impact. To change them, pass `title` or `impact` to `post_incident_update` or `draft_notification`. An update without them keeps the current values. The incident shows the values of the latest update.

Everything that an agent posts is public on the status page and can notify subscribers.

## Notification drafts with human review

Use a notification draft when a person must approve a notification before subscribers get it.

1. The agent calls `draft_notification`. Without `incidentId`, the draft declares a new incident or maintenance. With `incidentId`, the draft is an update to that incident.
2. The tool returns a `reviewUrl`, for example `https://status.example.com/manage/drafts/drf_...`. The agent gives this link to a person.
3. The person opens the link and signs in, if necessary. The portal shows the draft.
4. An editor can change the title, status, impact, message, services, the status of each service and the maintenance window.
5. The editor selects **Save draft** to keep the changes, or **Approve and send** to publish the draft. **Discard draft** closes the draft and sends nothing.
6. The agent calls `get_notification_draft` to read the result. The `state` is `pending`, `approved` or `discarded`.

Approval publishes the update on the status page and notifies subscribers. After approval, `incidentId` is the incident that has the published update, and `draft.publishedAt` gives the time of publication. See [Review notification drafts](/docs/guide/drafts/) for the portal steps.

The status page and subscribers see nothing until a person approves the draft. The service examines a draft with the same rules as `create_incident`, `schedule_maintenance` and `post_incident_update`. Thus an approved draft does not fail because of input that is not valid.

The published update shows the editor who approved it as the author. Only one review of a draft can succeed. If two editors review a draft at the same time, the second review gets a `conflict` error.

For safe retries, pass a UUID in `requestId` to `draft_notification`. Use a new UUID for each draft. With the same agent and UUID, a retry returns the first draft, with any review decision.

### Publish without a draft

An agent publishes directly only when it has `incidents.publish`. It notifies subscribers only when it also has `notifications.send`. Without `notifications.send`, pass `notify: false`, or use `draft_notification`. See [Notifications](/docs/agents/permissions/#notifications).

## Regions

Regions belong to each affected service.

- Call `list_regions` before you set a region.
- Pass `serviceRegions` to `create_incident`, `schedule_maintenance`, `post_incident_update`, `draft_notification` or `edit_incident`.
- Use one entry for each service, for example `[{"serviceId": "svc_api", "regionIds": ["reg_us", "reg_eu"]}]`.
- When a region exists, give each affected service one or more regions. There is no Global choice. For an outage in all regions, list all region ids.
- On an update, `serviceRegions` sets the regions for the services in that list. The other services keep their regions. A service that the update adds needs an entry.
- On `edit_incident`, `serviceRegions` replaces the regions of every service. Give each service one or more regions.
- To keep the current regions, omit `serviceRegions` on `edit_incident`.
- To read one region, pass `regionId` to `get_status`.

With no regions, the status page is one page. With regions, the page shows Overview and a tab for each region. Overview lists every outage. A region tab lists all services, but it shows an outage only for a service that the incident binds to that region.

When other regions remain, `delete_region` fails if an open incident has a service that uses only that region. Give that service a different region first. On a closed incident, such a service has no region after the delete. A service that also uses other regions keeps those regions. See [Services and regions](/docs/guide/services/) for the portal.

## How incidents affect services

| Event                                                          | Affected services become                                 |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| New incident with impact `minor`                               | `degraded_performance`                                   |
| New incident with impact `major`                               | `partial_outage`                                         |
| New incident with impact `critical`                            | `major_outage`                                           |
| New incident with impact `none`                                | no change                                                |
| Maintenance goes to `in_progress`                              | `under_maintenance`                                      |
| Incident goes to `resolved` or maintenance goes to `completed` | `operational`, unless another open incident affects them |
| Update with a new `impact`                                     | no change                                                |
| Any update with `serviceStatus`                                | exactly `serviceStatus`                                  |
| Any update with `serviceStatuses`                              | the status in its entry, for each service in the list    |
| Update with `serviceIds`                                       | the status of the update, for the added services         |

### A different status for each service

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

An entry also applies when a different open incident affects the service. Thus, when you resolve an incident, do not list a service that must go back to `operational`. Resolution restores that service, but keeps it as it is while a different open incident affects it.

### Add services on an update

An update adds the services in `serviceIds`. A service that is already affected stays on the incident. A new service gets `serviceStatus` when you set it. It gets its own entry in `serviceStatuses` when you give one.

With no status in the update, a new service follows the impact, as a new incident does. When the maintenance status is `in_progress` or `verifying`, the new service becomes `under_maintenance`. An update of a resolved incident does not change the new service.

A new impact on an update does not change a service that the incident already affects. A service that the update adds follows that impact.

`edit_incident` replaces the full service list. That edit does not change a service status. It does not change the title or the impact. Use `post_incident_update` for the title and the impact.

### Uptime

The history records each status change. The uptime bars show this history, by default for 90 days. A partial outage counts as 30% downtime, and a major outage as 100%. Degraded performance and maintenance count as uptime.

The percentage uses the full window. Time before the service existed is not downtime. A day before the service existed shows "No data". The uptime on a bar uses the time with data on that day.

A region tab counts only the outages in that region. Overview counts each outage.

## Design the status page through MCP

An agent with `settings.read` and `settings.write` can do the full design of the status page. It selects a theme, uploads the logo and the favicon, and writes custom CSS.

1. The agent calls `get_design_guide`. The result lists the theme presets, the design tokens, the CSS selectors, the rules, the limits and an example stylesheet.
2. The agent calls `update_settings` with `theme`.
3. The agent calls `upload_brand_asset` for the logo and for the favicon.
4. The agent calls `get_settings` to read the current `customCss`.
5. The agent calls `update_settings` with `customCss` for all other changes, such as the brand color in `--ic-brand`.

### Upload a logo or a favicon

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

The rules for a file are the same as in the portal:

- The maximum size of a file is 512 KB.
- A logo is a PNG, JPEG, WebP, GIF or SVG file. A favicon can also be an ICO file.
- An SVG file cannot contain a script or an event handler.
- The tool does not download a file from a URL.

The result of `get_settings`, `update_settings`, `upload_brand_asset` and `remove_brand_asset` has `logoUrl` and `faviconUrl` when a stored file exists. The activity log of the agent records which file changed. It does not record the file.

### Change the theme and the CSS

A value of `customCss` replaces the stored stylesheet. Thus the agent must call `get_settings` first, and then send the full stylesheet. To remove the stylesheet, pass `null`. [Custom CSS](/docs/theming/custom-css/) lists the tokens and the selectors that the stylesheet can use.

```json
{
	"theme": "carbon",
	"customCss": ":root:has(.ic-page) { --ic-brand: #7c5cff; --ic-radius: 1rem; }\n.ic-uptime-bar { border-radius: 9999px; }"
}
```

To remove "Powered by Incident Command" from the public pages, set `showPoweredBy` to `false`. To show the line again, set it to `true`. Do not hide the line with `customCss`.

The public status page shows the new design without a review by a person. Give `settings.write` only to an agent that you trust with the look of the page.

## Example prompts

Ask your agent in plain words. The agent selects the tools. This table shows some prompts and the tools that an agent usually calls for them.

| Prompt                                                                                                        | Tools                                                                       |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| "What is the current status of our services?"                                                                 | `get_status`                                                                |
| "We see API errors in us-east. Declare a major incident on the REST API and keep the status page up to date." | `list_services`, `list_regions`, `create_incident`, `post_incident_update`  |
| "Write a draft about the slow dashboard and give me the review link."                                         | `list_services`, `draft_notification`                                       |
| "Did somebody approve the draft?"                                                                             | `get_notification_draft`                                                    |
| "The fix works. Resolve the API incident."                                                                    | `list_incidents`, `resolve_incident`                                        |
| "Schedule maintenance for the database on Saturday from 02:00 to 04:00 UTC."                                  | `list_services`, `schedule_maintenance`                                     |
| "Use the carbon theme, set the brand color to #7c5cff and upload this SVG file as the logo."                  | `get_design_guide`, `update_settings`, `get_settings`, `upload_brand_asset` |

An agent without `incidents.publish` cannot declare an incident. The server tells it to write a draft for a person to approve.
