---
title: Environment variables
navTitle: Environment variables
description: Every environment variable that Incident Command reads, with its default value and its purpose.
order: 1
---

Incident Command reads its configuration from environment variables. All variables are optional, and the server treats an empty value as not set. The repository has a commented template in [`.env.example`](https://github.com/jaredwray/incident-command/blob/main/.env.example).

A duration accepts `ms`, `s`, `m`, `h`, `hr` or `d`, for example `30s`, `15m` or `7d`. A number without a unit is in milliseconds.

## Build

| Name                                 | Default                  | Description                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | A new key for each build | A build argument for `next build`, not a runtime variable. Next.js adds it to the server action ids and encrypts bound form values with it. Read [Server action key](/docs/operate/secrets/#server-action-key). |

## Server

| Name       | Default                   | Description                                                                 |
| ---------- | ------------------------- | --------------------------------------------------------------------------- |
| `PORT`     | `3000`                    | The port that the server listens on.                                        |
| `HOSTNAME` | `0.0.0.0` in the image    | The bind address. A container must use `0.0.0.0`.                           |
| `NODE_ENV` | `production` in the image | When `SITE_URL` is not set, `production` makes the session cookie `Secure`. |

## Site

| Name        | Default  | Description                                                                                                                                                                                      |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SITE_URL`  | Not set  | The public URL of the status page. Notifications, the RSS feed and the Markdown pages use it in links. The server removes a slash at the end. An `https://` URL makes the session cookie `Secure`. |
| `SITE_NAME` | `Status` | The first site name. An admin can change it in the portal.                                                                                                                                       |

## Storage

| Name                    | Default                 | Description                                                                                                                |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URI`          | Not set (memory)        | `postgres://`, `postgresql://`, `mongodb://`, `mongodb+srv://` or `memory://`. Read [Databases](/docs/operate/databases/). |
| `STORE`                 | From `DATABASE_URI`     | Selects the store: `memory`, `postgres` or `mongo`.                                                                        |
| `DATABASE_NAME`         | The database in the URL | The MongoDB database name.                                                                                                 |
| `DATABASE_TABLE_PREFIX` | `ic_`                   | The prefix of the PostgreSQL table names.                                                                                  |
| `DATABASE_POOL`         | `true`                  | Keeps a connection pool. `false` opens a connection for each query (PostgreSQL) or each operation (MongoDB).               |
| `SEED_DEMO`             | `false`                 | `true` or `1` adds demo services and incidents at startup when the store has no services.                                  |

## Cache

| Name                | Default | Description                                                                                           |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `CACHE_TTL`         | `30s`   | The time that a cached read stays fresh. The server serves cached data while the database is offline. |
| `CACHE_MAX_ENTRIES` | `5000`  | The maximum number of cache entries in each instance.                                                 |
| `SESSION_CACHE_TTL` | `30s`   | The time that an instance keeps a resolved portal session in memory. `0` turns off the session cache. |

Read [Health, cache and scale](/docs/operate/scaling/).

## Portal access

| Name          | Default | Description                                                 |
| ------------- | ------- | ----------------------------------------------------------- |
| `SESSION_TTL` | `7d`    | The lifetime of a portal session.                           |
| `SETUP_TOKEN` | Not set | When set, the first admin must enter it at `/manage/setup`. |

## Notifications

| Name                      | Default | Description                                                                                                                                                                               |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`          | Not set | Encrypts provider credentials and authenticator secrets in the database. Use at least 32 characters, for example from `openssl rand -base64 32`. The portal needs it to save credentials. |
| `ENCRYPTION_KEY_PREVIOUS` | Not set | Old keys, separated by commas. They decrypt the stored values that the old keys encrypted.                                                                                                |
| `EMAIL_FROM`              | Not set | The default sender of the email channel.                                                                                                                                                  |
| `WEBHOOK_SECRET`          | Not set | Signs each webhook with HMAC-SHA256. When it is not set, the server sends webhooks without a signature.                                                                                   |
| `EMAIL_PROVIDER`          | Auto    | `sendgrid` or `ses`, for an email channel without providers. Auto selects `sendgrid` when `SENDGRID_API_KEY` is set, else `ses` when `AWS_SES_REGION` is set.                             |
| `SENDGRID_API_KEY`        | Not set | The SendGrid API key, for an email channel without providers.                                                                                                                             |
| `AWS_SES_REGION`          | Not set | The SES region. It has priority over `AWS_REGION`.                                                                                                                                        |
| `AWS_REGION`              | Not set | The SES region when `AWS_SES_REGION` is not set.                                                                                                                                          |
| `AWS_ACCESS_KEY_ID`       | Not set | The SES access key. When it is not set, SES uses the default AWS credential chain, for example the IAM role.                                                                              |
| `AWS_SECRET_ACCESS_KEY`   | Not set | The SES secret access key, with `AWS_ACCESS_KEY_ID`.                                                                                                                                      |

Read [Notification providers](/docs/operate/notifications/) and [Secrets and key rotation](/docs/operate/secrets/).

## Cloudflare Worker

The Cloudflare Worker reads these variables. The app in the container does not use them. Read [Cloudflare](/docs/deploy/cloudflare/).

| Name                      | Default | Description                                                                                    |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `CONTAINER_INSTANCES`     | `1`     | The number of containers. Each client address uses one of them.                                |
| `CONTAINER_INSTANCE_TYPE` | `basic` | The container size: `lite`, `basic`, `standard-1`, `standard-2`, `standard-3` or `standard-4`. |
| `CONTAINER_SLEEP_AFTER`   | `30m`   | An idle container stops after this time (at most `6h`). The next request starts it again.      |
