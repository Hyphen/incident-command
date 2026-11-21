---
title: Azure
navTitle: Azure
description: Run Incident Command on Azure Container Apps, with Azure Database for PostgreSQL Flexible Server or Azure Cosmos DB for MongoDB.
order: 7
---

Azure Container Apps runs the Docker Hub image, or an image that Azure Container Registry builds from the `Dockerfile`. The database is Azure Database for PostgreSQL Flexible Server or Azure Cosmos DB for MongoDB.

## Before you start

- An Azure subscription.
- The [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), logged in with `az login`.
- For a build from source, a clone of the repository. Run the commands from the repository root.

Prepare the CLI and create a resource group:

```bash
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

export RG=incident-command
export LOCATION=eastus
az group create --name $RG --location $LOCATION
```

## Select the image

Container Apps runs images from public and private registries. It requires `linux/amd64` images, and the image is `linux/amd64`. Replace `<version>` with a release version, for example `1.2.3`:

```text
docker.io/jaredwray/incident-command:<version>
```

Docker Hub limits the number of image downloads. When a pull reaches the limit, the containers of the app do not start. To prevent this, Microsoft recommends a registry with sufficient limits, such as Azure Container Registry.

### Build from source

`az containerapp up --source .` creates a registry and builds the image from the root `Dockerfile`. Then it creates the Container Apps environment and the app. This build does not set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. See [Select the image](/docs/deploy/choose-a-platform/#select-the-image).

## Create the database

### Azure Database for PostgreSQL Flexible Server (recommended)

```bash
az postgres flexible-server create \
  --resource-group $RG --name incident-command-db --location $LOCATION \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 17 \
  --admin-user incident --admin-password 'CHOOSE_A_DB_PASSWORD' \
  --public-access 0.0.0.0
az postgres flexible-server db create --resource-group $RG \
  --server-name incident-command-db --database-name incident_command

export DATABASE_URI="postgresql://incident:CHOOSE_A_DB_PASSWORD@incident-command-db.postgres.database.azure.com:5432/incident_command?sslmode=verify-full"
```

`--public-access 0.0.0.0` allows connections from Azure services. For a private network, use VNet integration. The server certificates of Azure chain to public roots, so `sslmode=verify-full` works. See [Databases](/docs/operate/databases/). The app creates its tables on the first start.

### Azure Cosmos DB for MongoDB

1. In the Azure portal, create an **Azure Cosmos DB for MongoDB (vCore)** cluster.
2. Allow access from Azure services.
3. Copy the connection string of the cluster.

Cosmos DB is compatible with MongoDB, but not identical, so test it before you use it. The connection string usually names no database, so also set `DATABASE_NAME`:

```bash
export DATABASE_URI='mongodb+srv://USER:PASSWORD@CLUSTER.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000'
# and add DATABASE_NAME=incident_command to --set-env-vars in the secrets step
```

## Deploy

Create the app from the Docker Hub image. The app must exist before you can set its secrets.

```bash
az containerapp up \
  --name incident-command \
  --resource-group $RG \
  --location $LOCATION \
  --image docker.io/jaredwray/incident-command:<version> \
  --ingress external \
  --target-port 3000
```

This command creates the Container Apps environment and the app. For a build from source, replace `--image ...` with `--source .`.

## Set the secrets

Store the secrets in the app, and connect them to environment variables:

```bash
az containerapp secret set --name incident-command --resource-group $RG \
  --secrets database-url="$DATABASE_URI" setup-token='CHOOSE_A_LONG_TOKEN'

az containerapp update --name incident-command --resource-group $RG \
  --set-env-vars DATABASE_URI=secretref:database-url SETUP_TOKEN=secretref:setup-token \
    HOSTNAME=0.0.0.0 \
  --min-replicas 1 --max-replicas 3
```

Add `ENCRYPTION_KEY`, `WEBHOOK_SECRET` and the email keys the same way: `secret set`, then `secretref:`. Make `ENCRYPTION_KEY` with `openssl rand -base64 32`. For all variables, see [Environment variables](/docs/reference/environment-variables/).

To keep the secrets in Key Vault instead:

1. Give the app a managed identity with the **Key Vault Secrets User** role.
2. Reference each secret with `keyvaultref:`, for example `--secrets "database-url=keyvaultref:https://VAULT.vault.azure.net/secrets/database-url,identityref:system"`.

## Set SITE_URL and the domain

Set `SITE_URL` to the address of the app:

```bash
FQDN=$(az containerapp show --name incident-command --resource-group $RG \
  --query properties.configuration.ingress.fqdn -o tsv)

az containerapp update --name incident-command --resource-group $RG \
  --set-env-vars SITE_URL=https://$FQDN
```

When you add a custom domain, set `SITE_URL` to that domain with the same `update` command.

## Upgrade

Change the image to the new version:

```bash
az containerapp update --name incident-command --resource-group $RG \
  --image docker.io/jaredwray/incident-command:<new-version>
```

For a build from source, check out the new release tag. Then run the same `az containerapp up --source .` command again. See [Upgrades and backups](/docs/operate/upgrades/).

## Scale

- Container Apps scales to zero by default. `--min-replicas 1` prevents cold starts and keeps a warm cache. This cache also continues to serve the last known data if the database goes offline.
- Each replica has its own cache. With more than one replica, public reads can be up to `CACHE_TTL` (default `30s`) old.
- Each replica keeps its own Postgres connection pool. Size `--max-replicas` against the connection limit of the server.
- The default probes use TCP. You can add an HTTP probe on `/healthz`. It reports `degraded` with a 200 while the database is offline, and 503 only when the app cannot start.

See [Health, cache and scale](/docs/operate/scaling/).

## Next steps

Create the first admin and check the server: [After you deploy](/docs/deploy/after-deploy/).
