---
title: Sign in and two-factor authentication
navTitle: Sign in and two-factor
description: Accept an invite, sign in to the portal, set up an authenticator app, keep your recovery codes and change your password.
order: 2
---

Each member signs in to the portal with an email address and a password. Two-factor authentication adds a code from an authenticator app at each sign-in. By default, each member must use two-factor authentication.

Any member can do the tasks on this page. The first admin of a new status page does not get an invite. That admin uses the setup page. See [Quick start](/docs/getting-started/quick-start/).

## Accept an invite

An admin gives you an invite link. The link works one time. You cannot use it after 7 days.

1. Open the invite link in your browser.
2. Make sure that the **Email** field shows your email address. You cannot change this address.
3. Type your name in **Name**.
4. Type a password of at least 8 characters in **Password**.
5. Select **Create account**.

The page also shows the role that the admin gave you.

If the page shows "Invite not valid", the link is incorrect, or somebody used it, or it expired. Ask an admin for a new invite.

After you create the account, the portal signs you in. It shows "Welcome! Your account is ready." When two-factor authentication is necessary, the portal first shows the setup step. See [Set up an authenticator at sign-in](#set-up-an-authenticator-at-sign-in).

## Sign in

1. Go to `/manage/login` on your status page.
2. Type your email address in **Email**.
3. Type your password in **Password**.
4. Select **Sign in**.
5. If the **Check your authenticator** page opens, type the code from your authenticator app in **Authentication code**. You can also type a recovery code.
6. Select **Continue**.

If the email address or the password is incorrect, the page shows "Invalid email or password".

These rules apply to the **Check your authenticator** page:

- You have 5 minutes to type a correct code. After that time, sign in again.
- After 5 incorrect codes, the portal shows "Too many attempts. Sign in again." Then sign in again with your password.
- Each code from the app works one time.
- Each recovery code works one time. Spaces, dashes and capital letters in a recovery code have no effect.

To sign in with a different account, select **Use a different account**.

A session stays open for 7 days by default. The operator can change this time with `SESSION_TTL`. See [Environment variables](/docs/reference/environment-variables/).

## Sign out

1. Select your name at the bottom of the sidebar.
2. Select **Sign out**.

The **My Profile** page also has a **Sign out** button.

## Set up an authenticator at sign-in

When the **Require two-factor authentication** option is on, each member must have an authenticator. If you do not have one, the **Set up two-factor authentication** page opens after you type your password.

![The two-factor setup with the QR code, the authenticator key and the authenticator link](/images/manage-two-factor.png)

1. Open your authenticator app or your password manager.
2. Scan the QR code with the app.
3. If you cannot scan the QR code, select **Copy** next to **Authenticator key** or **Authenticator link**. Then paste the value into the app.
4. Type the code from the app in **Authentication code**.
5. Select **Turn on and continue**.
6. On the **My Profile** page, save the 10 recovery codes in a safe place.
7. Select **Hide recovery codes**.

After step 7, the portal does not show the recovery codes again.

## Set up an authenticator on My Profile

Do this task when two-factor authentication is off for your account.

1. Select your name at the bottom of the sidebar.
2. Select **My Profile**.
3. In **Two-factor authentication**, select **Set up authenticator**.
4. Scan the QR code with your authenticator app or your password manager. You can also copy the **Authenticator key** or the **Authenticator link** into the app.
5. Type the code from the app in **Code from the app**.
6. Select **Turn on two-factor authentication**.
7. Save the recovery codes. To copy all the codes, select **Copy**.
8. Select **Hide recovery codes**.

The page then shows "Two-factor authentication is on" and the number of recovery codes that you did not use.

If the page shows "The server cannot read the authenticator secret. Check ENCRYPTION_KEY.", tell the operator of the status page. See [Secrets and key rotation](/docs/operate/secrets/).

## Make new recovery codes

New recovery codes replace all the old codes. You must type your password.

1. Go to **My Profile**.
2. In **Two-factor authentication**, type your password in the first **Current password** field.
3. Select **Create new recovery codes**.
4. Save the new codes in a safe place. The old codes do not work after this step.
5. Select **Hide recovery codes**.

## Turn off two-factor authentication

You can turn off two-factor authentication only when the **Require two-factor authentication** option is off. When the option is on, the page shows "An admin requires two-factor authentication." and has no button to turn it off.

1. Go to **My Profile**.
2. In **Two-factor authentication**, type your password in the second **Current password** field.
3. Type a code from your app, or a recovery code, in **Authentication code**.
4. Select **Turn off two-factor authentication**.

## When two-factor authentication is necessary

The **Require two-factor authentication** option is on the **Settings** page. It is on by default. See [Settings](/docs/guide/settings/).

When the option is on, these rules apply:

- A member without an authenticator gets the setup page after the password step.
- A member who is signed in without an authenticator cannot open portal pages. Each page opens **My Profile** with "Set up two-factor authentication to continue."
- On **My Profile**, the member can only set up an authenticator, change the password and sign out.
- A member cannot turn off two-factor authentication.

When an admin turns the option off, each member keeps the authenticator. A member can then turn it off on **My Profile**.

## Change your password

1. Go to **My Profile**.
2. In **Change password**, type your password in **Current password**.
3. Type a new password of at least 8 characters in **New password**.
4. Select **Update password**.

The page shows "Password updated". If the password in **Current password** is incorrect, the page shows "Current password is incorrect".

## If you cannot sign in

The sign-in page has no link to reset a password. Ask an admin for help in these conditions:

- You do not know your password.
- You cannot use your authenticator, and you have no recovery codes.

The admin can remove your account and send you a new invite. See [Members and invites](/docs/guide/members/).
