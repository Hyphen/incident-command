---
title: Services and regions
navTitle: Services and regions
description: Add, edit, group, hide and delete services, set a service status by hand, and split the status page into region tabs.
order: 5
---

A service is a system that your customers use, for example an API or a website. The status page shows each visible service with its status and its uptime bars. Regions split the status page into tabs.

A viewer can read the **Services** and **Regions** pages. To change them, you must be an editor or an admin.

![The Services page with the status and the details of each service](/images/manage-services.png)

## Add a service

You must be an editor or an admin.

1. Go to **Services**.
2. In **Add a service**, type the name in **Name**. For example, "API".
3. Optional: type a group name in **Group**. For example, "Core services".
4. Optional: type a short text in **Description**. The status page shows it under the name of the service.
5. Optional: select **Hide from status page**.
6. Select **Add service**.

A new service has the status **Operational**. It goes to the end of the list.

## Groups and order

The status page shows the services in the order of the **All services** list. A service with a lower **Order** number shows first.

Services with the same **Group** name show together under that name. A group shows at the position of its first service. To make a group, type the same group name for each service.

## Edit a service

You must be an editor or an admin.

1. Go to **Services**.
2. Under the service, select **Edit details**.
3. Change **Name**, **Group**, **Description** or **Order**.
4. Select or clear **Hide from status page**.
5. Select **Save**.

A hidden service does not show on the status page, on the public incident pages or on the public subscribe page. It stays in the portal. A hidden service shows "(hidden)" next to its name.

## Set a service status by hand

You must be an editor or an admin.

1. Go to **Services**.
2. Next to the service, select the new status in the list.
3. Select **Set**.

The statuses are **Operational**, **Under maintenance**, **Degraded performance**, **Partial outage** and **Major outage**.

The portal records the change for the uptime history. A status that you set by hand does not show a message to visitors. To tell visitors about a problem, declare an incident. See [Incidents and maintenance](/docs/guide/incidents/).

## Delete a service

You must be an editor or an admin.

1. Go to **Services**.
2. Under the service, select **Edit details**.
3. Select **Delete service**.
4. In the dialog "Delete … and its uptime history?", select **OK**.

The portal deletes the service and its uptime history. It also removes the service from the services of each subscriber. A subscriber who had only that service then gets notifications for all services.

## About regions

Global is the default region. Global is not a region on the **Regions** page.

- With no regions, the status page is one page.
- With regions, the status page shows an **Overview** tab and one tab for each region.

Regions belong to each affected service of an incident, not to the service itself. When you declare an incident or post an update, you select the regions of each affected service. A service with no region is Global.

The tabs show different data:

- **Overview** shows each outage. It shows the status of each service for all incidents.
- A region tab shows each service. On a region tab, an incident counts only for a service that has that region.
- An incident for a Global service shows only on **Overview**.
- A status that you set by hand shows on all tabs.

## Add a region

You must be an editor or an admin.

1. Go to **Regions**.
2. In **Add a region**, type the name in **Name**. For example, "United States".
3. Optional: type a number in **Order**. A region with a lower number shows first.
4. Select **Add region**.

A region name can have 80 characters or fewer. Each name must be different. You cannot use the name "Global".

## Set the regions of an incident

You must be an editor or an admin.

1. Declare an incident, schedule maintenance, or open the post form of an incident.
2. Select an affected service.
3. Under "Regions for …", select one or more regions. Select no region for Global.
4. Complete the other fields of the form.
5. Select **Declare incident**, **Schedule maintenance** or **Post update**.

To change the regions later, use the **Regions** card on the **Dashboard** tab of the incident. For maintenance, use the **Maintenance window** card. See [Edit an incident](/docs/guide/incidents/#edit-an-incident).

![The Regions page with the regions and their order](/images/manage-regions.png)

## Edit or delete a region

You must be an editor or an admin.

To edit a region, do these steps:

1. Go to **Regions**.
2. Change the **Name** or the **Order** of the region.
3. Select **Save**.

To delete a region, do these steps:

1. Go to **Regions**.
2. Next to the region, select **Delete**.
3. In the dialog, select **OK**.

When you delete a region, the portal removes it from each incident. A service that used only that region becomes Global. A service that also used other regions keeps those regions.
