---
title: Quick start
navTitle: Quick start
description: Run Incident Command on your computer with Docker or from source, create the first admin, and open the status page.
order: 1
---

This page shows three ways to run Incident Command on your computer. Each way ends with the first admin account. For a production deployment, read [Choose a platform](/docs/deploy/choose-a-platform/).

## Run the image with demo data

This is the fastest way to see the product. It uses the in-memory store, so the data goes away when the container stops.

1. Install Docker.
2. Start the container. Replace `<version>` with a release version, for example `1.2.3`. The [Docker Hub page](https://hub.docker.com/r/jaredwray/incident-command/tags) lists the versions.

   ```bash
   docker run --rm -p 3000:3000 \
     -e SEED_DEMO=true \
     -e SETUP_TOKEN=change-me \
     jaredwray/incident-command:<version>
   ```

3. Open http://localhost:3000 to see the status page with demo services and incidents.
4. Open http://localhost:3000/manage/setup and create the first admin. Enter `change-me` in the setup token field.
5. Set up an authenticator app when the portal asks you. The portal requires two-factor authentication by default.

> The image is for `linux/amd64`. On a computer with an Arm processor, such as a Mac with Apple silicon, add `--platform linux/amd64` to the `docker run` command. Docker then runs the image with emulation.

## Run with Docker Compose and Postgres

Use this way to keep your data between restarts. The Compose file builds the image from the source and starts PostgreSQL 17.

1. Clone the repository:

   ```bash
   git clone https://github.com/jaredwray/incident-command.git
   ```

2. Go to the repository folder and copy the example settings:

   ```bash
   cd incident-command && cp .env.example .env
   ```

3. In `.env`, set `SETUP_TOKEN` to a long random value.
4. Start the app and the database:

   ```bash
   docker compose up -d --build
   ```

5. Make sure that the health check returns `"status":"ok"`:

   ```bash
   curl http://localhost:3000/healthz
   ```

6. Open http://localhost:3000/manage/setup and create the first admin with your `SETUP_TOKEN`.

To use MongoDB instead of PostgreSQL, read [Docker and Compose](/docs/deploy/docker/).

## Run from source

Use this way to change the code. You need Node.js 24 and pnpm. Run `corepack enable` to get pnpm.

1. Clone the repository and install the dependencies:

   ```bash
   git clone https://github.com/jaredwray/incident-command.git && cd incident-command && pnpm install
   ```

2. Start the development server with demo data:

   ```bash
   SEED_DEMO=true SETUP_TOKEN=change-me pnpm dev
   ```

3. Open http://localhost:3000 and http://localhost:3000/manage/setup.

Without `DATABASE_URI`, the server uses the in-memory store. The repository is a pnpm workspace. The app is in `packages/app`, and `pnpm dev` reads a `.env` file from that folder. The [contribution guide](https://github.com/jaredwray/incident-command/blob/main/CONTRIBUTING.md) tells more.

## Next steps

- Learn the words that the docs use in [Concepts](/docs/getting-started/concepts/).
- Take the [portal tour](/docs/guide/portal/).
- [Connect an agent](/docs/agents/connect/) to the MCP server.
- [Deploy](/docs/deploy/choose-a-platform/) to production.
