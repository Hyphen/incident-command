---
title: Members and invites
navTitle: Members and invites
description: Invite members with one-time links, make new invite links, revoke invites, change roles and remove members from the portal.
order: 6
---

Members are the people who sign in to the portal. Each member has one role: viewer, editor or admin. A new member gets an account through an invite link.

You must be an admin to use the **Members** page. For the tasks of each role, see [Portal tour and roles](/docs/guide/portal/#what-each-role-can-do).

![The Members page with the team, the open invites and the invite form](/images/manage-members.png)

## The Members page

Select **Members** in the sidebar. The page has these cards:

- **Team**: each member, with the email address, the last sign-in and the role. Your own account shows "(you)".
- **Open invites**: each invite that nobody used. This card shows only when an open invite exists.
- **Invite a member**: the form for a new invite.

## Invite a member

You must be an admin.

1. Go to **Members**.
2. In **Invite a member**, type the email address of the new member in **Email**.
3. Select a **Role**: **Viewer**, **Editor** or **Admin**. The default role is **Editor**.
4. Select **Create invite link**.
5. Select **Copy** to copy the link. The portal shows the link only one time.
6. Send the link to the new member.

The portal does not send the link by email. Send it through a safe channel, for example your team chat.

These rules apply to an invite link:

- The link works one time.
- The link is good for 7 days. After that, nobody can use it.
- A new invite for the same email address replaces the old invite.
- You cannot invite an email address that a member already uses.

The link starts with the **Public URL** from the settings. When that field is empty, the link uses the address of the portal in your browser. See [Settings](/docs/guide/settings/).

For the steps of the new member, see [Accept an invite](/docs/guide/account/#accept-an-invite).

## Make a new invite link

Make a new link when the member did not get the first link.

You must be an admin.

1. Go to **Members**.
2. In **Open invites**, find the invite.
3. Select **Copy link**.
4. Send the new link to the member.

**Copy link** makes a new link and copies it. Nobody can use the old link after that. The new link keeps the role and the end date of the invite. If your browser does not let the page copy the link, the page shows the link and a **Copy** button.

An expired invite shows "Expired" and has no **Copy link** button. Invite the email address again. The new invite replaces the expired invite.

## Revoke an invite

You must be an admin.

1. Go to **Members**.
2. In **Open invites**, find the invite.
3. Select **Revoke**.
4. In the dialog, select **OK**.

Nobody can use the link after that. The page shows "Invite revoked".

## Change the role of a member

You must be an admin.

1. Go to **Members**.
2. In **Team**, find the member.
3. Select the new role in the list next to the member.
4. Select **Save**.

The page shows "Member updated". The new role applies to the next action of the member.

The status page must always have at least one admin. You cannot change the role of the last admin.

## Remove a member

You must be an admin.

1. Go to **Members**.
2. In **Team**, find the member.
3. Select **Remove**.
4. In the dialog, select **OK**.

The page shows "Member removed". When you remove a member, these changes occur:

- The portal ends each session of the member.
- The portal disconnects each agent that the member connected with OAuth.
- The agents of the member stay on the **Agents** page.

You cannot remove the last admin.

To give a member a new password, remove the member. Then send a new invite to the same email address.
