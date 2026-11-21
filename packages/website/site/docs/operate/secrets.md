---
title: Secrets and key rotation
navTitle: Secrets and key rotation
description: Set ENCRYPTION_KEY, SETUP_TOKEN, WEBHOOK_SECRET and the server action key, and change the encryption key without data loss.
order: 3
---

Incident Command reads its secrets from environment variables. Keep each secret in the secret store of your platform, for example Wrangler secrets, Google Secret Manager, AWS Secrets Manager or Azure Key Vault.

| Secret                               | What it does                                                             | Read                                    |
| ------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------- |
| `DATABASE_URI`                       | Holds the database password.                                             | [Databases](/docs/operate/databases/)   |
| `SETUP_TOKEN`                        | Protects the page that creates the first admin.                          | [First admin](#first-admin-setup_token) |
| `ENCRYPTION_KEY`                     | Encrypts provider credentials and authenticator secrets in the database. | [Encryption key](#encryption-key)       |
| `WEBHOOK_SECRET`                     | Signs each webhook request.                                              | [Webhooks](/docs/reference/webhooks/)   |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | A build-time key for the portal forms.                                   | [Server action key](#server-action-key) |

## First admin (SETUP_TOKEN)

The first admin account comes from `/manage/setup`. When `SETUP_TOKEN` is set, that page requires the token. Without it, the first person who opens the page becomes the admin. Always set `SETUP_TOKEN` before the server is on the internet.

After the first admin exists, the setup page is closed. You can then remove `SETUP_TOKEN`.

## Encryption key

`ENCRYPTION_KEY` encrypts these values with AES-256-GCM before the server stores them:

- The credentials of notification providers (API keys, auth tokens and secret access keys).
- The authenticator secrets of members who use two-factor authentication.

Make a key and set it:

1. Make a key:

   ```bash
   openssl rand -base64 32
   ```

2. Set the key as `ENCRYPTION_KEY` in the secret store of your platform. The key must have at least 32 characters.
3. Restart the server.

Without `ENCRYPTION_KEY`:

- You can turn channels on and off, and add providers that need no credentials, such as Amazon SES with an IAM role. You cannot save credentials.
- The server stores new authenticator secrets as plain text. After you set the key, the next sign-in of each member encrypts that member's secret.

Each encrypted value is bound to its provider and field, or to its member. A value that moves to a different place does not decrypt. The portal and the MCP server never show a saved credential again. Leave a credential field empty to keep the saved value.

### When the key is lost

If the key changes or is lost, the stored values do not decrypt:

- The portal shows the providers whose credentials do not decrypt. Enter those credentials again.
- The queue does not open. Enter the **Connection URI** again in the **Queue** card, and select **Save queue**.
- A member whose authenticator secret does not decrypt sees "The server cannot read the authenticator secret. Check ENCRYPTION_KEY." That member must set up a new authenticator. Use the steps below.

To give a member a new authenticator:

1. If an admin requires two-factor authentication, the admin turns off **Require two-factor authentication** in **Manage → Settings → General**.
2. The member signs in with a recovery code.
3. On **My Profile**, the member selects **Turn off two-factor authentication**, and enters the password and a different recovery code.
4. The member sets up the authenticator again on **My Profile**.
5. The admin turns on **Require two-factor authentication** again.

### Change the key

1. Set the new key as `ENCRYPTION_KEY` and the old key as `ENCRYPTION_KEY_PREVIOUS`. `ENCRYPTION_KEY_PREVIOUS` can hold more than one key, separated by commas.
2. Restart the server. The old key still decrypts the stored values.
3. In **Manage → Settings → Notifications**, select **Save channel** on each channel that has providers. Each save encrypts the values of that channel again with the new key.
4. If you use a queue, select **Save queue** in the **Queue** card. The save encrypts the connection URI again with the new key.
5. Keep the old key in `ENCRYPTION_KEY_PREVIOUS` until each member with an authenticator signs in one time. Each sign-in encrypts the authenticator secret of that member again with the new key. A session lasts for `SESSION_TTL` (default `7d`), so most members sign in again in that time.
6. Remove `ENCRYPTION_KEY_PREVIOUS` and restart the server. A member who did not sign in during step 5 needs a new authenticator. See [When the key is lost](#when-the-key-is-lost).

## Server action key

The portal forms use Next.js server actions. `next build` uses `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for two things:

- It adds the key to the server action ids. A new key gives new ids.
- It encrypts the values that a form binds to a server action.

`next build` writes the key into the files of the image. Make one with `openssl rand -base64 32` and give it to each build.

### The prebuilt image

The key of the public Docker Hub image is public, because anyone can read the files of that image. The risk is low:

- The only bound value is the id of an invite, and the action that uses it requires an admin.
- Each server action checks the session and the permissions of the member.

Each release of the public image has a different key. After an upgrade, a portal page that a browser loaded before the upgrade shows "This page is out of date" on its next form submit. A reload fixes it.

### Build your own image

Build your own image if you want a private key, or the same server action ids from one release to the next:

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

```bash
docker build --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY -t incident-command .
```

Run the commands from the repository root. Keep the key in your secret store and give the same key to each build. The key is only in the build stage, so it is not in the image history. It is in the files of the image, so keep your image in a private registry. The [Cloudflare guide](/docs/deploy/cloudflare/) shows how `pnpm cf:deploy` gives the key to the build.
