---
title: Google Cloud
navTitle: Google Cloud
description: Run Incident Command on Google Cloud Run, with Cloud SQL for PostgreSQL or MongoDB Atlas and the secrets in Secret Manager.
order: 5
---

Cloud Run runs the Docker Hub image, or an image that Cloud Build makes from the `Dockerfile`. The database is Cloud SQL for PostgreSQL or MongoDB Atlas. Secret Manager keeps the secrets.

## Before you start

- A Google Cloud project with an active Cloud Billing account.
- The [`gcloud` CLI](https://cloud.google.com/sdk/docs/install), logged in with `gcloud auth login`.
- For a build from source, a clone of the repository. Run the commands from the repository root.

Set the project and the region, and turn on the APIs:

```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com
```

## Select the image

Cloud Run can deploy public images from Docker Hub directly. Replace `<version>` with a release version, for example `1.2.3`:

```text
docker.io/jaredwray/incident-command:<version>
```

Cloud Run keeps a Docker Hub image in its cache for up to one hour. Google recommends Docker Hub only for popular images, and an [Artifact Registry remote repository](https://docs.cloud.google.com/artifact-registry/docs/repositories/remote-repo) for higher availability.

### Build from source

`gcloud run deploy --source .` builds the root `Dockerfile` with Cloud Build. [`deploy/gcp/cloudbuild.yaml`](https://github.com/jaredwray/incident-command/blob/main/deploy/gcp/cloudbuild.yaml) builds the image, pushes it to Artifact Registry and deploys it. These builds do not set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. See [Select the image](/docs/deploy/choose-a-platform/#select-the-image).

## Create the database

### Cloud SQL for PostgreSQL (recommended)

```bash
gcloud sql instances create incident-command-db \
  --database-version=POSTGRES_17 --edition=enterprise --tier=db-f1-micro --region=$REGION
gcloud sql databases create incident_command --instance=incident-command-db
gcloud sql users create incident --instance=incident-command-db --password='CHOOSE_A_DB_PASSWORD'

export INSTANCE=$PROJECT_ID:$REGION:incident-command-db
export DATABASE_URI="postgresql://incident:CHOOSE_A_DB_PASSWORD@/incident_command?host=/cloudsql/$INSTANCE"
```

Cloud Run connects through the Cloud SQL Unix socket (`--add-cloudsql-instances` in the deploy command). Thus the connection needs no TLS settings and no IP allow list. The app creates its tables on the first start.

### MongoDB Atlas

```bash
export DATABASE_URI='mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/incident_command?retryWrites=true&w=majority'
```

Cloud Run has no fixed outbound IP address. Use one of these two methods:

- Allow `0.0.0.0/0` in the Atlas IP access list, and use a strong password.
- Send the outbound traffic through a VPC with Cloud NAT and a static IP address.

With Atlas, remove `--add-cloudsql-instances` from the deploy command.

## Set the secrets

Put the secrets in Secret Manager, and give a service account access to them:

```bash
printf '%s' "$DATABASE_URI" | gcloud secrets create incident-command-database-url --data-file=-
printf '%s' 'CHOOSE_A_LONG_TOKEN' | gcloud secrets create incident-command-setup-token --data-file=-

gcloud iam service-accounts create incident-command
export SA=incident-command@$PROJECT_ID.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$SA --role=roles/cloudsql.client
for s in incident-command-database-url incident-command-setup-token; do
  gcloud secrets add-iam-policy-binding $s \
    --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

Keep other secrets the same way, and add them to `--set-secrets`. Examples are `ENCRYPTION_KEY`, `WEBHOOK_SECRET` and `SENDGRID_API_KEY`. `ENCRYPTION_KEY` encrypts the notification provider credentials that admins save in the portal. Make one with `openssl rand -base64 32`.

For email through Amazon SES, set `EMAIL_FROM` and `AWS_SES_REGION`. Keep `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as secrets. For all variables, see [Environment variables](/docs/reference/environment-variables/).

## Deploy

```bash
gcloud run deploy incident-command \
  --image=docker.io/jaredwray/incident-command:<version> \
  --region=$REGION \
  --allow-unauthenticated \
  --port=3000 \
  --service-account=$SA \
  --add-cloudsql-instances=$INSTANCE \
  --set-secrets=DATABASE_URI=incident-command-database-url:latest,SETUP_TOKEN=incident-command-setup-token:latest \
  --min-instances=1 \
  --max-instances=2
```

In `--set-secrets`, `latest` is the newest version of the secret, not an image tag. Cloud Run sets `PORT` itself, and `--port=3000` tells it which port the app uses.

For a build from source, replace `--image=...` with `--source .`.

## Set SITE_URL and the domain

Set `SITE_URL` to the URL of the service:

```bash
URL=$(gcloud run services describe incident-command --region=$REGION --format='value(status.url)')
gcloud run services update incident-command --region=$REGION --update-env-vars=SITE_URL=$URL
```

When you add a custom domain, set `SITE_URL` to that domain with the same `update` command.

## Upgrade

Deploy the new version:

```bash
gcloud run deploy incident-command \
  --image=docker.io/jaredwray/incident-command:<new-version> \
  --region=$REGION
```

The environment variables, the secrets and the Cloud SQL settings stay as you set them on the service. This command changes only the image.

For a build from source, check out the new release tag and run `gcloud run deploy --source .` again. You can also redeploy with Cloud Build:

```bash
gcloud artifacts repositories create incident-command --repository-format=docker --location=$REGION
gcloud builds submit --config deploy/gcp/cloudbuild.yaml \
  --substitutions=_REGION=$REGION,_REPOSITORY=incident-command,_SERVICE=incident-command .
```

The Cloud Build service account needs `roles/run.admin`, and `roles/iam.serviceAccountUser` on `$SA`. To deploy on each push, attach `cloudbuild.yaml` to a Cloud Build trigger. See [Upgrades and backups](/docs/operate/upgrades/).

## Scale

- `--min-instances=1` prevents cold starts and keeps one warm cache. This cache also continues to serve the last known data if the database goes offline. With `0`, an idle service scales to zero, and the first request waits while the server starts.
- Each instance has its own cache. With more than one instance, public reads can be up to `CACHE_TTL` (default `30s`) old.
- Each instance keeps its own Postgres connection pool, and node-postgres opens up to 10 connections by default. Keep `--max-instances` × pool size below the connection limit of the database. `db-f1-micro` allows 25 connections, so select a larger tier for more instances.
- Cloud Run ignores the `HEALTHCHECK` of the image. You can add an HTTP liveness probe on `/healthz`. It reports `degraded` with a 200 while the database is offline, and 503 only when the app cannot start.

See [Health, cache and scale](/docs/operate/scaling/).

## Next steps

Create the first admin and check the server: [After you deploy](/docs/deploy/after-deploy/).
