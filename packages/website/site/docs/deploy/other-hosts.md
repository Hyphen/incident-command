---
title: Fly.io, Render and Railway
navTitle: Fly.io, Render and Railway
description: Run Incident Command on Fly.io, Render or Railway, from the Docker Hub image or from the Dockerfile, with a managed Postgres database.
order: 8
---

Fly.io, Render and Railway can run the Docker Hub image, or build the root `Dockerfile` from the repository. On each host, do these steps:

1. Attach a managed Postgres database.
2. Set the variables as secrets.
3. Point the health check at `/healthz`.

## Before you start

- An account on the host. For Fly.io, also install the `fly` CLI (flyctl).
- For a build from source, a GitHub repository with the code, for example your fork.

These hosts set `PORT` themselves, and the server listens on the port in `PORT`. If a host changes `HOSTNAME`, set `HOSTNAME=0.0.0.0` explicitly.

## Select the image

All three hosts can run a public image from Docker Hub. Replace `<version>` with a release version, for example `1.2.3`:

```text
jaredwray/incident-command:<version>
```

For a build from source, each host finds the `Dockerfile` at the repository root. These builds do not set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, unless you give it to the build. See [Select the image](/docs/deploy/choose-a-platform/#select-the-image).

## Fly.io

### Create the database

Create or attach a Postgres database before the first deploy. You set its connection string as `DATABASE_URI` in the next step.

### Set the secrets

Create the app without a deploy. For a build from source, run `fly launch --no-deploy` in the repository root instead.

```bash
fly launch --image jaredwray/incident-command:<version> --no-deploy
```

Make sure that `fly.toml` has these settings. For a build from source, leave out the `[build]` section.

```toml
[build]
  image = "jaredwray/incident-command:<version>"

[http_service]
  internal_port = 3000

[[http_service.checks]]
  grace_period = "30s"
  interval = "30s"
  method = "GET"
  timeout = "5s"
  path = "/healthz"
```

The grace period gives the server time to start. It agrees with the start period of the health check in the image. Then set the secrets:

```bash
fly secrets set DATABASE_URI='postgres://...' SITE_URL=https://<app>.fly.dev \
  SETUP_TOKEN='CHOOSE_A_LONG_TOKEN'
```

### Deploy

```bash
fly deploy
```

### Set SITE_URL and the domain

`SITE_URL` is `https://<app>.fly.dev` in the step above. When you add a custom domain, set `SITE_URL` to it with `fly secrets set`.

### Upgrade

Change the tag in the `[build]` section of `fly.toml`, and run `fly deploy`. You can also give the image on the command line:

```bash
fly deploy --image jaredwray/incident-command:<new-version>
```

For a build from source, check out the new release tag and run `fly deploy`.

### Scale

In `[http_service]`, `auto_stop_machines` tells Fly Proxy what to do when the app is idle: `"off"` (the default), `"stop"` or `"suspend"`. With `"stop"` or `"suspend"`, `min_machines_running` keeps Machines on in the primary region. Keep at least one Machine on for a warm cache.

## Render

### Create the database

Create a Render Postgres database. Copy its **Internal Database URL**.

### Set the secrets

Add these environment variables to the web service:

- `DATABASE_URI`: the Internal Database URL.
- `SETUP_TOKEN`: a long random token.
- `SITE_URL`: the public URL of the service.

### Deploy

1. In the Render Dashboard, select **+ New**, then **Web Service**.
2. Under **Source Code**, select **Existing Image**.
3. Enter the image URL `docker.io/jaredwray/incident-command:<version>`. A public image needs no credential.
4. Select **Connect**, and set the name, the region and the instance type.
5. Add the environment variables of the previous step.
6. Set **Health Check Path** to `/healthz`.
7. Select **Deploy**.

For a build from source, create a **Web Service** from the repository with the runtime **Docker**.

### Set SITE_URL and the domain

Set `SITE_URL` to the URL of the service, or to your custom domain.

### Upgrade

Render does not deploy again when a new image comes to the tag. To upgrade:

1. In the **Settings** of the service, under **Deploy**, change the tag in the image URL.
2. Select **Manual Deploy → Deploy latest reference**.

For a build from source, deploy the commit of the new release.

### Scale

A free web service stops after 15 minutes without inbound traffic, and the next request starts it again. A paid instance runs all the time, so use a paid instance for a status page.

## Railway

### Create the database

Add a **PostgreSQL** service to the project.

### Set the secrets

On the app service, set these variables:

- `DATABASE_URI=${{Postgres.DATABASE_URL}}`
- `SETUP_TOKEN`: a long random token.
- `SITE_URL`: the public URL of the service.

### Deploy

1. Create a service from a Docker image, and enter `jaredwray/incident-command:<version>` as the image path.
2. In the service settings, set the healthcheck path to `/healthz`.

For a build from source, create a project from the GitHub repository. Railway finds the `Dockerfile`.

### Set SITE_URL and the domain

Set `SITE_URL` to the public URL of the service, or to your custom domain.

### Upgrade

When a new image version is available, Railway shows an update button in the service settings. With a version tag, such as `1.2.3`, the update stages the new version tag. You can also change the tag of the image yourself.

### Scale

The Serverless option stops a service after 10 minutes without activity. Railway counts outbound traffic as activity, and database connections are outbound traffic. The next request starts the service again, and the first response is slow.

## Next steps

Create the first admin and check the server: [After you deploy](/docs/deploy/after-deploy/).
