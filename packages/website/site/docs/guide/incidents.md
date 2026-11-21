---
title: Incidents and maintenance
navTitle: Incidents and maintenance
description: Declare an incident, post updates, resolve it, schedule maintenance, and delete an incident from the public view in the portal.
order: 3
---

An incident tells visitors about a problem. Maintenance tells visitors about planned work. Each incident and each maintenance has posts. A post is an update on the status page, and it can notify subscribers.

A viewer can read incidents. To declare, post, edit or delete, you must be an editor or an admin.

![The Incidents page with open, resolved and deleted incidents](/images/manage-incidents.png)

## The Incidents page

Select **Incidents** in the sidebar. The page has these cards:

- **Open**: the incidents and maintenance that are not resolved or completed.
- **Drafts**: the notification drafts that wait for review. This card shows only when a draft waits. See [Review notification drafts](/docs/guide/drafts/).
- **Resolved**: the 50 most recent resolved incidents and completed maintenance.
- **Deleted**: the 50 most recent incidents that a member deleted from the public view. This card shows only when a deleted incident exists.

Each row shows the title, the kind, the date and the number of posts. When your status page has regions, the row also shows the regions.

## Declare an incident

You must be an editor or an admin.

1. Go to **Incidents** or **Overview**.
2. Select **Declare incident**.
3. Type a short title for customers in **Incident Title**. For example, "Elevated API error rates".
4. Select a **Status**: **Investigating**, **Identified**, **Monitoring** or **Resolved**.
5. Select an **Impact**: **None**, **Minor**, **Major** or **Critical**.
6. Type the first public update in **Message**.
7. Under **Affected services**, select each service that the incident affects.
8. Optional: select a status in the list next to a selected service. That status applies to that service only.
9. When your status page has regions, select one or more regions for each selected service. For an outage in all regions, select all regions.
10. Optional: in **Set affected services to**, select a status for all the affected services. **Automatic** uses the impact.
11. Keep **Notify subscribers** selected to send a notification. Clear it to post without a notification.
12. Select **Declare incident**.

The incident page opens and shows "Incident declared".

![The form to declare an incident](/images/manage-incident-new.png)

## The incident page

Open an incident from **Incidents** or **Overview**. The page has three tabs:

- **Dashboard**: the status of the affected services for each minute, the 5 latest posts, and the drafts for this incident. Editors and admins also see the side card and the delete area.
- **Timeline**: each event of the incident, with its author.
- **Posts**: all the posts, newest first.

Each post shows its author. It also tells if the author notified subscribers. Select **View public page** to open the incident on the status page.

![An incident in the portal, with the status timeline and the posts](/images/manage-incident.png)

## Post an update

You must be an editor or an admin.

1. Open the incident.
2. In **Posts**, select **Create a post**.
3. Change the **Incident Title** if necessary. The incident shows the title of the latest post.
4. Select the new **Status**.
5. For an incident, change the **Impact** if necessary.
6. Type the update in **Message**.
7. Optional: in **Set affected services to**, select a status for all the affected services.
8. Optional: in **Status of each service**, select a status for one service. Each row shows the status that the service has now.
9. Optional: in **Add a service**, select a service to add it to the incident. Select its status and its regions if necessary.
10. Keep or clear **Notify subscribers**.
11. Select **Post update**.

A new impact does not change the status of the services that the incident already affects. To change their status, use step 7 or step 8.

### Follow the notifications

When a post notifies subscribers, the portal shows the progress:

- Without a queue, a window shows "Notifications complete" and the state of each notification: **Waiting**, **In progress**, **Sent** or **Failed**.
- With a queue, the **Dashboard** tab of the incident shows a progress bar and the text "The queue sends the notifications." The bar updates until the queue is done.

An admin selects the queue in **Settings**. See [Select a notification queue](/docs/guide/settings/#select-a-notification-queue).

## Resolve an incident

You must be an editor or an admin.

1. Open the incident.
2. In **Posts**, select **Create a post**.
3. In **Status**, select **Resolved**. For maintenance, select **Completed**.
4. Type a last update for customers in **Message**.
5. Keep **Set affected services to** at **Automatic**.
6. Select **Post update**.

With **Automatic**, each affected service goes back to **Operational**. A service keeps its status when a different open incident also affects it. The incident moves to the **Resolved** card.

To open a resolved incident again, post an update with an open status, for example **Investigating**.

## Schedule maintenance

You must be an editor or an admin.

1. Go to **Incidents** or **Overview**.
2. Select **Schedule maintenance**.
3. Type a title in **Incident Title**.
4. In **Status**, select **Scheduled** for planned work.
5. Set the start time in **Starts (UTC)** and the end time in **Ends (UTC)**.
6. Type the first public update in **Message**.
7. Under **Affected services**, select each service. When your status page has regions, select the regions of each service.
8. Keep or clear **Notify subscribers**.
9. Select **Schedule maintenance**.

The two times use UTC. The end must be after the start. Maintenance has no impact.

The status page shows scheduled maintenance under "Upcoming maintenance". The status of the maintenance does not change automatically at the start time. Move the maintenance through its statuses with posts:

1. At the start of the work, post an update with the status **In progress**. The affected services become **Under maintenance**.
2. Optional: post an update with the status **Verifying** when you examine the result.
3. At the end of the work, post an update with the status **Completed**. The affected services become **Operational**.

## Edit an incident

You must be an editor or an admin.

You can make some changes without a post. Use the side card on the **Dashboard** tab:

- For maintenance, the **Maintenance window** card has **Starts (UTC)**, **Ends (UTC)** and the regions of each service. Select **Save window**.
- For an incident, the **Regions** card has the regions of each service. Select **Save regions**. This card shows only when your status page has regions and the incident affects a service.

These changes do not make a post, and they do not notify subscribers. To change the title or the impact, post an update.

## Delete an incident

You must be an editor or an admin. Delete an incident only when customers must not see it. You cannot undo this action.

1. Open the incident.
2. On the **Dashboard** tab, go to **Delete this incident**.
3. Select **Delete incident**.
4. Type the reason in **Reason**. Use 1000 characters or fewer. Other members can read this reason.
5. Select **Delete from the public view**.

The **Incidents** page opens and shows "Incident deleted from the public view". After the delete, these rules apply:

- The status page, the history, the RSS feed and the API do not show the incident. Agents cannot read it.
- A public link to the incident shows a page that tells the visitor that the page was not found.
- Subscribers do not get a message. The messages that the status page sent before stay with the subscribers.
- The services keep their status. If necessary, set their status again on the **Services** page.
- You cannot edit or restore the incident. **Overview** does not count it.
- The portal keeps the incident and its posts. The **Deleted** card shows who deleted it, when, and why.

## How incidents change the service status

An incident or maintenance changes the status of the affected services. This table uses **Automatic** for **Set affected services to**.

| Event                                                             | The affected services become                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| You declare an incident with the impact **Minor**                 | **Degraded performance**                                                                                                                 |
| You declare an incident with the impact **Major**                 | **Partial outage**                                                                                                                       |
| You declare an incident with the impact **Critical**              | **Major outage**                                                                                                                         |
| You declare an incident with the impact **None**                  | No change                                                                                                                                |
| The maintenance status changes to **In progress**                 | **Under maintenance**                                                                                                                    |
| The incident is **Resolved**, or the maintenance is **Completed** | **Operational**, unless a different open incident affects the service                                                                    |
| A post changes the **Impact**                                     | No change                                                                                                                                |
| A post adds a service                                             | The added service follows the impact. When the maintenance status is **In progress** or **Verifying**, it becomes **Under maintenance**. |

A status in **Set affected services to** replaces the automatic status for all the affected services. A status for one service replaces the automatic status and **Set affected services to**, for that service only. A status for one service also applies when a different open incident affects that service.

To set a status without an incident, see [Set a service status by hand](/docs/guide/services/#set-a-service-status-by-hand).

## How incidents change uptime

The portal records each change of a service status. The status page uses these records for the uptime bars and the uptime percentages.

- A partial outage counts as 30% downtime.
- A major outage counts as 100% downtime.
- Degraded performance and maintenance do not count as downtime.

The uptime window is 90 days by default. An admin can change it. See [Settings](/docs/guide/settings/).
