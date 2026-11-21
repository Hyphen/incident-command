---
title: Docker and Compose
navTitle: Docker and Compose
description: Run Incident Command with Docker or Docker Compose on a VPS or on a different container host, with Postgres or MongoDB.
order: 2
---

The image runs the Next.js standalone server on port 3000 as the unprivileged `node` user. Each host that runs a Linux container can run it. This page shows two setups:

- Docker Compose: the app and Postgres on one host.
- Plain Docker: one container that connects to a database that you operate.

For Fly.io, Render and Railway, see [Fly.io, Render and Railway](/docs/deploy/other-hosts/).

## Before you start

- Docker 24 or later, with Compose v2 (`docker compose version`).
- A Postgres or MongoDB database, or the Postgres service of the Compose stack.
- An amd64 host. On an arm64 host, Docker must run the image with amd64 emulation (`--platform linux/amd64`).

## Select the image

Replace `<version>` with a release version, for example `1.2.3`, in the commands on this page.

The prebuilt image is on Docker Hub:

```bash
docker pull jaredwray/incident-command:<version>
```

The Compose stack needs `docker-compose.yml` and `.env.example` from the repository. Clone the release tag to get them:

```bash
git clone --branch v<version> https://github.com/jaredwray/incident-command.git
cd incident-command
```

### Build from source

Build the image from the repository root:

```bash
docker build -t incident-command:<version> .
```

To set a private server action key, put `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in the environment and add the build argument:

```bash
docker build --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY -t incident-command:<version> .
```

`docker compose up --build` does not give the key to the build, so each Compose build makes a new key. See [Secrets and key rotation](/docs/operate/secrets/).

## Create the database

The Compose stack starts `postgres:17-alpine` with the named volume `postgres-data`. The user, the password and the database are `incident`, `incident` and `incident_command`. The Postgres port is not open on the host.

Inside Compose, use the service names (`postgres`, `mongo`) in `DATABASE_URI`, not `localhost`.

To use MongoDB instead:

1. In `.env`, set `DATABASE_URI=mongodb://mongo:27017/incident_command`.
2. Add `--profile mongo` to each `docker compose up` command.

Postgres still starts, but the app does not use it. Data does not move between the databases.

With plain Docker, use a Postgres or MongoDB database that you operate. A database on a private network needs no TLS settings. For a managed database with TLS, see [Databases](/docs/operate/databases/). The app creates its tables on the first start.

## Set the secrets

Copy the template, then set at least `SITE_URL` and `SETUP_TOKEN` in `.env`:

```bash
cp .env.example .env
```

Compose gives each variable in `.env` to the app container. Git ignores `.env`, so the file stays out of the repository.

To save notification provider credentials in the portal, also set `ENCRYPTION_KEY`. Make a key with `openssl rand -base64 32`. For all variables, see [Environment variables](/docs/reference/environment-variables/).

## Deploy

### Docker Compose with the prebuilt image

1. Make the file `compose.image.yaml` next to `docker-compose.yml`:

   ```yaml
   services:
     app:
       image: jaredwray/incident-command:<version>
   ```

2. Start the stack with both files:

   ```bash
   docker compose -f docker-compose.yml -f compose.image.yaml up -d
   docker compose -f docker-compose.yml -f compose.image.yaml logs -f app
   ```

The second file replaces the `image` of the app. The app service also has a `build` section, so Compose pulls the image first. Compose builds from source only when the registry does not have the image. Thus, make sure that the tag is correct.

### Docker Compose with a build from source

```bash
docker compose up -d --build
docker compose logs -f app
```

### Plain Docker

```bash
docker run -d --name incident-command --restart unless-stopped -p 3000:3000 \
  -e DATABASE_URI='postgres://USER:PASSWORD@DB_HOST:5432/incident_command' \
  -e SITE_URL=https://status.example.com \
  -e SETUP_TOKEN='CHOOSE_A_LONG_TOKEN' \
  jaredwray/incident-command:<version>
```

To keep the settings in a file, use `docker run --env-file .env ...`. For an image that you built, replace the image name with `incident-command:<version>`.

## Set SITE_URL and the domain

Put a reverse proxy in front of port 3000 for TLS. [Caddy](https://caddyserver.com/) gets the certificate automatically:

```bash
caddy reverse-proxy --from status.example.com --to localhost:3000
```

Set `SITE_URL=https://status.example.com` in `.env`. Then run the `docker compose ... up -d` command again. Compose makes a new container when its configuration changes. With plain Docker, remove the container and start it again with the new value.

## Upgrade

Back up the database before an upgrade. For the Postgres service of the Compose stack, use this command:

```bash
docker compose exec postgres pg_dump -U incident incident_command > backup.sql
```

For the prebuilt image with Compose, change the tag in `compose.image.yaml`. Then start the stack again:

```bash
docker compose -f docker-compose.yml -f compose.image.yaml up -d
```

For plain Docker, pull the new version and replace the container:

```bash
docker pull jaredwray/incident-command:<new-version>
docker rm -f incident-command
```

Then run the `docker run` command again with the new tag.

For a build from source, check out the new release tag and build again:

```bash
git fetch --tags
git checkout v<new-version>
docker compose up -d --build
```

Each release of the public image has a different server action key. A portal page that a browser loaded before the upgrade can show "This page is out of date" one time. A reload fixes it. See [Upgrades and backups](/docs/operate/upgrades/).

## Scale

The containers keep no state on disk. You can run more than one container behind a load balancer, all with the same database. Never run more than one container with the memory store, because each container then has its own data.

Each container has its own cache and its own database connection pool. See [Health, cache and scale](/docs/operate/scaling/).

## Next steps

Create the first admin and check the server: [After you deploy](/docs/deploy/after-deploy/).
