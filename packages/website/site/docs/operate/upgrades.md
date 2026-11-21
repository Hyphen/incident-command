---
title: Upgrades and backups
navTitle: Upgrades and backups
description: Select an image version, back up the database, upgrade to a new release, and restore a backup.
order: 5
---

Each GitHub release of Incident Command publishes a container image on Docker Hub. This page tells how to select a version, back up your data and upgrade.

## Select a version

The image `jaredwray/incident-command` has these tags:

| Tag           | Example  | Moves to                                   |
| ------------- | -------- | ------------------------------------------ |
| Full version  | `1.2.3`  | Never. It always points to the same image. |
| Minor version | `1.2`    | Each patch release of 1.2.                 |
| Major version | `1`      | Each minor and patch release of 1.         |
| `latest`      | `latest` | The latest release.                        |

A prerelease, such as `1.3.0-rc.1`, gets only its full version tag.

Use the full version tag in production. Then an upgrade occurs only when you change the tag. The [GitHub releases](https://github.com/jaredwray/incident-command/releases) list the changes of each release. This site also shows them in its changelog. A release that needs work from you has an "Upgrade notes" heading.

## Upgrade

1. Read the release notes of each release between your version and the new version.
2. Back up the database.
3. Change the image tag to the new version and deploy.
4. Make sure that `GET /healthz` returns `"status":"ok"`.

The server updates the tables, the collections and the indexes when it starts. After an upgrade, a portal page that a browser loaded before the upgrade can show "This page is out of date". A reload fixes it.

Use the commands of your platform to deploy. Each [deploy guide](/docs/deploy/choose-a-platform/) has an "Upgrade" section.

## Back up

Back up the database before each upgrade, and on a schedule. Most managed databases have automatic backups. Use them, and make sure that you can restore one.

PostgreSQL:

```bash
pg_dump --format=custom --file=incident-command.dump "$DATABASE_URI"
```

MongoDB:

```bash
mongodump --uri="$DATABASE_URI" --archive=incident-command.archive
```

With the Docker Compose stack, run `pg_dump` in the database container:

```bash
docker compose exec postgres pg_dump -U incident incident_command > backup.sql
```

Also keep `ENCRYPTION_KEY` in a safe place. A backup without that key cannot decrypt the provider credentials or the authenticator secrets.

## Restore

1. Stop the app, or scale it to zero instances.
2. Restore the backup into an empty database.

   PostgreSQL:

   ```bash
   pg_restore --clean --if-exists --dbname="$DATABASE_URI" incident-command.dump
   ```

   MongoDB:

   ```bash
   mongorestore --uri="$DATABASE_URI" --drop --archive=incident-command.archive
   ```

3. Start the app with the same `ENCRYPTION_KEY` and the image version of the backup, or a later version.

## Go back to an earlier version

A new release can change the stored data when it starts. An earlier version can then fail to read the data. To go back to an earlier version, restore the backup that you made before the upgrade. Then deploy the earlier version.
