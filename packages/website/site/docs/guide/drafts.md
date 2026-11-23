---
title: Review notification drafts
navTitle: Review notification drafts
description: Examine, change, approve or discard the notification drafts that agents write, before the status page shows them and subscribers get them.
order: 4
---

A notification draft is a new incident, a new maintenance or an update that an agent wrote. The status page does not show a draft, and subscribers do not get it. A person examines the draft first. Then the person approves it or discards it.

## Where drafts come from

Only agents write drafts. An agent uses the `draft_notification` MCP tool. The portal has no form to write a draft. A new agent can write drafts, but it cannot publish. See [Agent workflows](/docs/agents/workflows/) and [MCP tools](/docs/agents/tools/).

A draft is one of these kinds:

- **New incident** or **New maintenance**: the draft declares a new incident or schedules new maintenance.
- **Incident update** or **Maintenance update**: the draft is a post for an incident or maintenance on the status page.

The tool gives the agent a review link, for example `https://status.example.com/manage/drafts/drf_...`. The agent can give this link to a person.

## Find the drafts

Any member can open and read a draft. You can find drafts in these places:

- **Overview** shows a message, for example "1 notification draft waits for review." Select **Review drafts →**.
- On **Incidents**, the **Drafts** card lists each draft that waits for review. Each row shows the title, the kind, the agent that wrote it and the time. Select **Review** to open the draft.
- On an incident page, the **Dashboard** tab shows the drafts for that incident at the top.
- Open the review link from the agent. If you are not signed in, the portal opens the draft after you sign in.

## Who can review a draft

You must be an editor or an admin to save, approve or discard a draft. This permission (`drafts.review`) is for people only. An agent cannot approve a draft, also when it can publish.

A viewer sees the draft in the **Notification** card, without buttons.

## Approve a draft

You must be an editor or an admin.

1. Open the draft.
2. Read the **Review the notification** form.
3. Change the fields if necessary. The fields are the same fields as in a new incident or a new post.
4. Select **Approve and send**.

The fields of the form depend on the kind of draft:

- A new incident has **Incident Title**, **Status**, **Impact**, **Message**, **Affected services** and **Set affected services to**.
- New maintenance also has **Starts (UTC)** and **Ends (UTC)**. It has no impact.
- An update has a **Status** option that keeps the status of the incident. It also has **Status of each service**, **Regions of each service** and **Add a service**.

Subscribers get the text in **Message**. The status page shows it too.

## What approval does

When you select **Approve and send**, the portal does these steps:

1. It saves your changes to the draft.
2. It publishes the draft. A new incident or maintenance shows on the status page, or the update shows on its incident.
3. It changes the status of the affected services, with the same rules as a post. See [How incidents change the service status](/docs/guide/incidents/#how-incidents-change-the-service-status).
4. It notifies subscribers. The review form has no option to post without a notification.

The incident page then opens and shows "Draft approved. The update is published and subscribers are notified." The post shows the agent that wrote it and the person who approved it.

Only one review of a draft can be a success. If two members review the same draft at the same time, the second member sees "Somebody else reviewed this draft at the same time. Reload the draft."

If a member deletes the incident of an update draft, you cannot approve the draft. The draft page tells you to discard it.

## Save a draft for later

You must be an editor or an admin.

1. Open the draft.
2. Change the fields in **Review the notification**.
3. Select **Save draft**.

The draft keeps your changes and continues to wait for review. The status page does not show it, and subscribers do not get it.

## Discard a draft

You must be an editor or an admin.

1. Open the draft.
2. Select **Discard draft**.
3. In the dialog "Discard this draft? Nothing is published or sent.", select **OK**.

The **Incidents** page opens and shows "Draft discarded". The status page does not show the draft, and subscribers do not get it.

## After the review

The draft page keeps a record of the review. It shows "Approved by" or "Discarded by", with the name of the member and the time. The agent can read the result of the review with the `get_notification_draft` tool.
