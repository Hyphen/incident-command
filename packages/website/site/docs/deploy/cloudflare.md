---
title: Cloudflare
navTitle: Cloudflare
description: Run Incident Command in Cloudflare Containers behind a Worker, with a Postgres or MongoDB database that accepts connections from the internet.
order: 3
---

The app runs on [Cloudflare Containers](https://developers.cloudflare.com/containers/). The container runs the image from the root `Dockerfile`: the same Next.js server as on other container hosts. A Worker in front of the container gets each request and sends it to the container.

| File                                                                                                                                             | Content                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [`packages/app/wrangler.jsonc`](https://github.com/jaredwray/incident-command/blob/main/packages/app/wrangler.jsonc)                             | The Worker, the container, the Durable Object and the vars.     |
| [`packages/app/cloudflare-worker.ts`](https://github.com/jaredwray/incident-command/blob/main/packages/app/cloudflare-worker.ts)                 | The Worker entry. It exports the `AppContainer` Durable Object. |
| [`packages/app/src/lib/cloudflare-worker.ts`](https://github.com/jaredwray/incident-command/blob/main/packages/app/src/lib/cloudflare-worker.ts) | The logic of the Worker and the Durable Object.                 |
| [`scripts/wrangler-docker.sh`](https://github.com/jaredwray/incident-command/blob/main/scripts/wrangler-docker.sh)                               | Gives `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to the image build.  |

## How it works

```text
 browsers, agents ─▶ Worker ─▶ AppContainer Durable Object ─▶ container (Next.js on port 3000)
                    (picks an     (starts the container,          │
                     instance)     sends each request)            ▼
                                                        Postgres or MongoDB, email, webhooks
```

1. The Worker picks an instance from the client address. Each client address always uses the same instance, so a client reads its own changes from the cache of that instance.
2. The `AppContainer` Durable Object of the instance starts the container on the first request. The container gets each var and each secret of the Worker as an environment variable, except the `CONTAINER_*` vars.
3. The Durable Object waits until the server answers on `/healthz`. Then it sends the request to the server. It sets `x-forwarded-host`, `x-forwarded-proto` and `x-forwarded-for`. Next.js compares the `Origin` of a server action with `x-forwarded-host`.
4. When no request comes for approximately `CONTAINER_SLEEP_AFTER` (default `30m`), Cloudflare stops the container. The next request starts it again. This start takes some seconds.
5. A deploy restarts the Durable Object. If the deploy changed the image, a var or a secret, the Durable Object replaces the container on the next request. The new container gets the new image and the new values.

A build without the Docker layer cache, as in CI, gives a new image. So the first request after such a deploy starts a new container.

The container is a Node.js server, so these items work as on other container hosts:

- Subscriber notifications: webhooks, email and text messages.
- The notification queue. It runs in the container. A restart continues a job that stopped.
- A database connection pool in each container.
- The cache of each container keeps the last known data while the database is offline.

## Before you start

- A Cloudflare account on the Workers Paid plan. Containers need this plan.
- Docker, or a Docker-compatible engine, on the computer that deploys. `wrangler deploy` builds the image for `linux/amd64` and pushes it to the Cloudflare registry.
- Node 24 and pnpm (`corepack enable`).

Cloudflare bills a container while it runs. See [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/).

## Select the image

Cloudflare cannot pull the Docker Hub image. With the `durable_object` scheduling policy, the image must be a Dockerfile or a digest-pinned image in the Cloudflare managed registry. Thus `pnpm cf:deploy` builds the image from the root `Dockerfile`. Then it pushes the image to the registry of your Cloudflare account.

Clone the release tag and install the dependencies. Replace `<version>` with a release version, for example `1.2.3`.

```bash
git clone --branch v<version> https://github.com/jaredwray/incident-command.git
cd incident-command
pnpm install
```

`docker build` installs the dependencies of the image from the frozen lockfile, with the policies of `pnpm-workspace.yaml`.

### Keep the server action ids between deploys

Next.js salts the id of each server action with `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. Without that variable, `next build` makes a new key, and each deploy changes every id. A portal page that a browser loaded before the deploy then sends ids that the new container does not know. Next.js logs `Failed to find Server Action` and answers 409. The portal shows "This page is out of date" until the user loads the page again.

Make one key and use it for each deploy:

```bash
openssl rand -base64 32
```

Wrangler gives only the `build_vars` of `wrangler.jsonc` to `docker build`, and that file is not secret. `pnpm cf:deploy` sets `WRANGLER_DOCKER_BIN` to `scripts/wrangler-docker.sh`. That script adds the key from the environment as a build argument. The key is not in the command line, in a file of the repository or in the image history.

`next build` writes the key into the server action manifest, so the key is in the files of the image. The image stays in the registry of your Cloudflare account. Thus your key stays private while the image stays in that registry. Next.js also encrypts the closure variables of server actions with the key. See [Secrets and key rotation](/docs/operate/secrets/).

## Create the database

Use a Postgres database (Neon, Supabase, RDS, Cloud SQL, and so on) or a MongoDB database (for example Atlas). The database must accept connections from the internet, because the addresses of the containers are not fixed. Use TLS and a strong password.

- For Postgres, add the correct `sslmode` value to the connection string. See [Databases](/docs/operate/databases/).
- For MongoDB, use the `mongodb+srv://` connection string.

[Hyperdrive](https://developers.cloudflare.com/hyperdrive/) is not used. A container cannot use a Hyperdrive binding, so the app connects to the database directly and keeps a connection pool.

## Set the secrets

Run the `wrangler` commands in `packages/app`, where `wrangler.jsonc` is:

```bash
cd packages/app
npx wrangler login
```

In `wrangler.jsonc`, set `name` and the `vars`. Set at least `SITE_URL`, the public URL of the status page. Non-secret settings (`SITE_URL`, `SITE_NAME`, `CACHE_TTL`, `EMAIL_FROM`, …) go in `vars`.

Set the secrets. Each command prompts for the value. Set only the secrets that you use.

```bash
npx wrangler secret put DATABASE_URI       # postgres://USER:PASSWORD@HOST:5432/incident_command
npx wrangler secret put SETUP_TOKEN        # required to create the first admin at /manage/setup
npx wrangler secret put ENCRYPTION_KEY     # encrypts provider credentials (openssl rand -base64 32)
npx wrangler secret put WEBHOOK_SECRET     # signs webhook payloads
npx wrangler secret put SENDGRID_API_KEY   # email through SendGrid, with EMAIL_FROM in vars
```

If the Worker does not exist yet, wrangler asks to create it. Without `DATABASE_URI`, each container uses its own memory store and loses its data when it stops. For all settings, see [Environment variables](/docs/reference/environment-variables/).

## Deploy

Start Docker. Then, from the repository root, build the image, push it and deploy the Worker:

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY='<key>' pnpm cf:deploy
```

The Worker is at `https://<name>.<your-subdomain>.workers.dev`, where `<name>` is the `name` in `wrangler.jsonc`. After the first deploy, wait some minutes before you send requests. Cloudflare must prepare the image first.

When the container does not answer in 60 seconds, the Worker answers `503` with `retry-after: 10`. The Workers Logs show the reason. The logs of the container are in the Containers dashboard.

## Set SITE_URL and the domain

1. Add your domain under **Workers & Pages → your Worker → Settings → Domains & Routes**.
2. Set `SITE_URL` in the `vars` of `wrangler.jsonc` to the new URL.
3. Deploy again with `pnpm cf:deploy` and the same key.

## Upgrade

Check out the new release tag and deploy with the same key:

```bash
git fetch --tags
git checkout v<new-version>
pnpm install
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY='<key>' pnpm cf:deploy
```

If you changed `packages/app/wrangler.jsonc`, keep your changes. For example, run `git stash` before the checkout and `git stash pop` after it.

Wrangler keeps the secrets between deploys. After the deploy, the Durable Object replaces the container on the next request.

### Move from the OpenNext Worker

Earlier versions ran the app in the Worker through OpenNext. To move a Worker that you deployed that way:

1. Remove a `hyperdrive` block from `wrangler.jsonc`.
2. Set the `DATABASE_URI` secret to the direct connection string of the database.
3. Keep the other secrets. The container gets them.
4. Deploy with `pnpm cf:deploy`. The first deploy creates the `AppContainer` Durable Object and the container application.
5. Delete the `.open-next` directory, if you have one.

## Scale

These vars configure the Worker. The container does not get them.

| Var                       | Default | Description                                                                                                                                                                                                                |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTAINER_INSTANCES`     | `1`     | The number of containers. Each client address uses one of them. Use more than one only with Postgres or MongoDB.                                                                                                           |
| `CONTAINER_INSTANCE_TYPE` | `basic` | The size of each container: `lite` (1/16 vCPU, 256 MiB), `basic` (1/4 vCPU, 1 GiB), `standard-1`, `standard-2`, `standard-3` or `standard-4`. The server uses approximately 200 MiB after it sends the first notification. |
| `CONTAINER_SLEEP_AFTER`   | `30m`   | An idle container stops after approximately this time. Use `ms`, `s`, `m` or `h`. The maximum is `6h`. A longer time gives fewer slow first requests and costs more.                                                       |
- Each container has its own cache. With more than one container, a client on a different address can see data that is up to `CACHE_TTL` (default `30s`) old. Each container also keeps a portal session in memory for `SESSION_CACHE_TTL` (default `30s`).
- Never use the memory store with more than one container. The memory store loses its data when the container stops, so use it only for previews.
- Each container keeps its own database connection pool. Size `CONTAINER_INSTANCES` against the connection limit of the database.
- The container also serves the static files (`/_next/static/*` and `public/`). No edge cache is in front of them, so a cold start also delays these files.
- The container can connect to each public host. Webhook subscribers must use URLs that the container can reach.

See [Health, cache and scale](/docs/operate/scaling/).

## Local development

```bash
pnpm cf:dev
```

This command runs the Worker in workerd and the container in your local Docker engine. Put local secrets in `packages/app/.dev.vars`, for example `SETUP_TOKEN=...`. Git ignores this file.

Press `r` to build the image again after a change to the app. For quick changes to the app, `pnpm dev` is faster.

## Next steps

Create the first admin and check the server: [After you deploy](/docs/deploy/after-deploy/).
