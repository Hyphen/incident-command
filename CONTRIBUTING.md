# Contributing to Incident Command

Thank you for your help. This guide tells how to set up the repository, run the checks and open a pull request. The user documentation is at <https://incident-command.org>.

## Repository layout

The repository is a pnpm workspace.

| Path                               | Contents                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/app`                     | The Next.js app: the status page, the portal, the MCP server and the API.                |
| `packages/website`                 | The documentation site at incident-command.org, built with [docula](https://docula.org). |
| `Dockerfile`, `docker-compose.yml` | The container image and the local Compose stack. Build from the repository root.         |
| `deploy/`                          | Config files for the deploy guides.                                                      |
| `scripts/`                         | The Safe Chain bootstrap, the Wrangler Docker wrapper and the image smoke test.          |
| `.github/workflows/`               | CI, the image release and the deploys.                                                   |

`AGENTS.md` is the project guide for coding agents, and it is also a good summary for people. It describes the code layout, the conventions and the writing style.

## Set up

You need Node.js 24 and pnpm. Run `corepack enable` to get the pnpm version from `package.json`.

1. Clone the repository and install the dependencies from the repository root:

   ```bash
   pnpm install
   ```

2. Start the development server with demo data:

   ```bash
   SEED_DEMO=true SETUP_TOKEN=change-me pnpm dev
   ```

3. Open http://localhost:3000 and http://localhost:3000/manage/setup.

`pnpm dev` reads a `.env` file from `packages/app/`. Docker Compose reads the `.env` file in the repository root. Both files use the variables in `.env.example`.

Aikido Safe Chain checks each package that a package manager installs in the cloud environments (Codespaces, Cursor and Claude Code on the web). Do not bypass its shims. Read `AGENTS.md` for the rules.

## Commands

Run each command from the repository root.

| Command              | What it does                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`           | Starts the app in development mode.                                           |
| `pnpm lint`          | Runs Biome and fixes what it can.                                             |
| `pnpm typecheck`     | Runs the TypeScript compiler.                                                 |
| `pnpm test`          | Runs Vitest with coverage.                                                    |
| `pnpm build`         | Makes the production build (standalone output).                               |
| `pnpm website:dev`   | Starts the documentation site with live reload.                               |
| `pnpm website:build` | Builds the documentation site into `packages/website/dist`.                   |
| `pnpm cf:dev`        | Runs the Cloudflare Worker and the container on your computer (needs Docker). |

## Before you open a pull request

1. Run `pnpm lint`, `pnpm typecheck` and `pnpm test`.
2. Keep the coverage of `packages/app/src` at 100% (lines, branches, functions and statements).
3. Update the documentation in `packages/website/site/docs` when you change a behavior that the docs describe.
4. Write the text in ASD-STE100 Simplified Technical English. `AGENTS.md` lists the rules.

The tests for the PostgreSQL adapter run against an in-process PostgreSQL ([PGlite](https://pglite.dev)). The MongoDB tests use [mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server). You need no external services.

## Documentation

Each page is a Markdown file in `packages/website/site/docs/<section>/`. The front matter has `title`, `navTitle`, `description` and `order`. docula does not rewrite relative links, so link to other pages with site paths such as `/docs/deploy/docker/`. CI builds the site and checks its links on each pull request.

## Releases

A maintainer publishes a GitHub release with a tag such as `v1.2.3`. These workflows then run:

- `release-docker.yml` builds the image from the tag, runs a smoke test and pushes `jaredwray/incident-command` to Docker Hub. It needs the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets in the `docker-hub` environment.
- `deploy-website.yml` deploys the documentation site, so the changelog shows the release. It needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets in the `website` environment.

Put an "Upgrade notes" heading in the release notes when operators must do work for the release.

## Development Worker

The `deploy-development.yml` workflow deploys the `incident-command-development` Worker and its container to <https://dev.incident-command.org>. It runs on each push to `main`. You can also start it from the Actions tab. The job uses the `development` GitHub environment. The settings are in the `env.development` block of `packages/app/wrangler.jsonc`.

The workflow does these steps:

1. It installs the dependencies through Socket Firewall.
2. It runs `pnpm cf:deploy --env development` with the `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` secret in the environment. Wrangler builds the image from the root `Dockerfile` with the Docker engine of the runner. Then it pushes the image and deploys the Worker.

The `development` environment in `wrangler.jsonc` sets these items:

- The Worker name is `incident-command-development`.
- The Worker has the custom domain `dev.incident-command.org`. The `workers.dev` URL and preview URLs are off.
- Workers Logs keeps all `console` output and all invocation logs (`head_sampling_rate: 1`).
- `SITE_URL` is `https://dev.incident-command.org`.
- `DEPLOYMENT` is `development`. The **Settings** page then shows **Clear incidents**. The container keeps `NODE_ENV` as `production`.

An environment does not inherit `vars`, `containers` or `durable_objects`. The `env.development` block repeats them.

### One-time setup

1. Add the `incident-command.org` zone to the Cloudflare account that hosts the Worker. Wrangler creates the DNS record and the certificate for `dev.incident-command.org`. If a CNAME record for that hostname exists, delete it first.
2. Create a Cloudflare API token. Use the "Edit Cloudflare Workers" template, and limit it to the account and the `incident-command.org` zone. The token must have these permissions:
   - Account > Workers Scripts > Edit
   - Account > the Containers permission with edit access. Wrangler calls this scope `containers:write` ("Manage Workers Containers").
   - Zone > Workers Routes > Edit, for `incident-command.org`
3. In the GitHub repository, open **Settings > Environments** and create the `development` environment. You can add a deployment branch rule that allows only `main`.
4. Add these environment secrets to `development`:

   | Secret                               | Value                                     |
   | ------------------------------------ | ----------------------------------------- |
   | `CLOUDFLARE_API_TOKEN`               | The API token from step 2.                |
   | `CLOUDFLARE_ACCOUNT_ID`              | The account ID of the Cloudflare account. |
   | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | A key from `openssl rand -base64 32`.     |

5. Set the Worker secrets (see the next section) before the first deploy.

### Worker secrets

The workflow does not set Worker secrets. Wrangler keeps them between deploys, so set each secret one time. Run the commands in `packages/app`:

```bash
npx wrangler secret put DATABASE_URI --env development
```

```bash
npx wrangler secret put SETUP_TOKEN --env development
```

If the Worker does not exist yet, wrangler asks to create it. A new secret makes a new version of the Worker. The container gets the new value on the next request.

| Secret             | Needed | Notes                                                                                                                      |
| ------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URI`     | Yes    | A PostgreSQL or MongoDB connection string. Without it, the container uses a memory store and loses its data when it stops. |
| `SETUP_TOKEN`      | Yes    | Protects `/manage/setup`. Without it, the first visitor becomes admin.                                                     |
| `ENCRYPTION_KEY`   | No     | Encrypts the provider credentials and the authenticator secrets.                                                           |
| `WEBHOOK_SECRET`   | No     | Signs webhook payloads.                                                                                                    |
| `SENDGRID_API_KEY` | No     | Email through SendGrid, when the email channel has no providers in the portal.                                             |

### Documentation site

The `deploy-website.yml` workflow deploys the documentation site to <https://incident-command.org>. The Worker config is `packages/website/wrangler.jsonc`. Set up the `website` GitHub environment as in steps 2 to 4 above, without the server action key. The API token needs Account > Workers Scripts > Edit and Zone > Workers Routes > Edit for `incident-command.org`.

## Security

Read [SECURITY.md](SECURITY.md) to report a vulnerability. Do not open a public issue with the details of a vulnerability.
