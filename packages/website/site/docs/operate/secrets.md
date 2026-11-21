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
- The server stores new authenticator secrets as plain text. A member who set up an authenticator before you set the key keeps a plain-text secret until that member sets up the authenticator again.

Each encrypted value is bound to its provider and field, or to its member. A value that moves to a different place does not decrypt. The portal and the MCP server never show a saved credential again. Leave a credential field empty to keep the saved value.

### When the key is lost

If the key changes or is lost, the stored values do not decrypt:

- The portal shows the providers whose credentials do not decrypt. Enter those credentials again.
- A member whose authenticator secret does not decrypt sees "The server cannot read the authenticator secret. Check ENCRYPTION_KEY." That member can sign in with a recovery code and set up the authenticator again.

### Change the key

1. Set the new key as `ENCRYPTION_KEY` and the old key as `ENCRYPTION_KEY_PREVIOUS`. `ENCRYPTION_KEY_PREVIOUS` can hold more than one key, separated by commas.
2. Restart the server. The old key still decrypts the stored values.
3. In **Manage → Settings → Notifications**, select **Save channel** on each channel that has providers. Each save encrypts the values of that channel again with the new key.
4. Keep the old key in `ENCRYPTION_KEY_PREVIOUS` while members use authenticators that they set up with it. The server does not encrypt an authenticator secret again when a member signs in. A member who sets up the authenticator again gets a secret with the new key.
5. Remove `ENCRYPTION_KEY_PREVIOUS` and restart the server.

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
