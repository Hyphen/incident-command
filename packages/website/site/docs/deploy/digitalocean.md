---
title: DigitalOcean
navTitle: DigitalOcean
description: Run Incident Command on DigitalOcean App Platform from one spec file, with the Docker Hub image and a managed Postgres database.
order: 4
---

App Platform runs the Docker Hub image, or builds the `Dockerfile`, and attaches a managed Postgres database. One spec file describes the app: [`deploy/digitalocean/app.yaml`](https://github.com/jaredwray/incident-command/blob/main/deploy/digitalocean/app.yaml).

## Before you start

- A DigitalOcean account.
- [`doctl`](https://docs.digitalocean.com/reference/doctl/how-to/install/), authenticated with `doctl auth init`.
- A copy of `deploy/digitalocean/app.yaml`. Clone the repository, or download the file.

## Select the image

The spec runs the public image from Docker Hub. Replace `<version>` with a release version, for example `1.2.3`:

```yaml
services:
  - name: web
    image:
      registry_type: DOCKER_HUB
      registry: jaredwray
      repository: incident-command
      tag: "<version>"
```

A public image needs no registry credentials. App Platform runs only Linux images for the AMD64 architecture, and the image is `linux/amd64`.

### Build from source

To build from source, for example from your fork:

1. Connect GitHub to App Platform (**Apps → Create App → GitHub**).
2. In `app.yaml`, remove the `image` block.
3. Remove the comment marks from the `github`, `source_dir` and `dockerfile_path` lines.
4. Set `github.repo` and `github.branch` to your repository and branch.

App Platform then builds the `Dockerfile` at the repository root. `deploy_on_push: true` redeploys on each push to the branch. This build does not set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, unless you give it to the build. See [Select the image](/docs/deploy/choose-a-platform/#select-the-image).

## Create the database

The spec attaches a dev database with the name `db`: a small managed Postgres instance for a first deploy. For production, create a managed Postgres cluster with daily backups. Then reference it in `databases`:

```yaml
databases:
  - name: db
    engine: PG
    production: true
    cluster_name: <your-cluster>
    db_name: incident_command
    db_user: incident
```

The spec sets `DATABASE_URI` to `${db.DATABASE_URL}&uselibpqcompat=true`. This value binds the app to the `db` component.

The `uselibpqcompat=true` suffix is necessary. node-postgres treats `sslmode=require` as full certificate verification, and DigitalOcean databases use the DigitalOcean CA. With the suffix, the connection stays encrypted, but the app does not verify the certificate chain. See [Databases](/docs/operate/databases/).

If the app logs a certificate or connection error at boot, set `DATABASE_URI` manually:

1. Copy the connection string from **Databases → your database → Connection details**.
2. Replace `sslmode=require` with `sslmode=no-verify`.
3. Set the result as the value of `DATABASE_URI`.

## Set the secrets

Edit these values in `app.yaml`:

- `region`.
- `SETUP_TOKEN`. Replace `change-me-now` with a long random token.
- The optional variables. Remove the comment marks from `ENCRYPTION_KEY`, `WEBHOOK_SECRET`, `EMAIL_FROM` and `SENDGRID_API_KEY` as necessary.

App Platform encrypts the values with `type: SECRET` when you first submit them. You can also edit them under **App → Settings → web → Environment Variables**. Do not commit a spec file that contains real secret values. For all variables, see [Environment variables](/docs/reference/environment-variables/).

## Deploy

Create the app:

```bash
doctl apps create --spec deploy/digitalocean/app.yaml
doctl apps list
```

Write down the app ID and the URL from `doctl apps list`. The health check of the spec uses `/healthz`.

## Set SITE_URL and the domain

The spec sets `SITE_URL` to `${APP_URL}`, the URL of the app. When you add a custom domain, set `SITE_URL` to that domain. Then apply the spec again:

```bash
doctl apps update <APP_ID> --spec deploy/digitalocean/app.yaml
```

## Upgrade

App Platform does not redeploy automatically from Docker Hub. To upgrade, change `tag` in `app.yaml` to the new version. Then apply the spec:

```bash
doctl apps update <APP_ID> --spec deploy/digitalocean/app.yaml
```

For a build from source, push the new release to the branch. `deploy_on_push` then deploys it. See [Upgrades and backups](/docs/operate/upgrades/).

## Scale

- Increase `instance_count`, or use autoscaling. Autoscaling on CPU needs a dedicated CPU plan. See [How to Scale Apps in App Platform](https://docs.digitalocean.com/products/app-platform/how-to/scale-app/).
- Each instance has its own cache. With more than one instance, public reads can be up to `CACHE_TTL` (default `30s`) old.
- The health check reports `degraded` with a 200 when the database stops after boot. Thus App Platform keeps the instance, and the instance serves its cached data. It returns 503 only when the app cannot start, for example when it cannot reach the database at boot.
- App Platform also has a Scale to Zero feature for idle web services. Then the first request after an idle period waits for a cold start.

See [Health, cache and scale](/docs/operate/scaling/).

## Next steps

Create the first admin and check the server: [After you deploy](/docs/deploy/after-deploy/).
