---
title: Databases
navTitle: Databases
description: Select PostgreSQL, MongoDB or the in-memory store with DATABASE_URI, set up TLS for PostgreSQL, and size the connection pool.
order: 1
---

Incident Command keeps its data in PostgreSQL, MongoDB or memory. The server selects the store from `DATABASE_URI`. It makes the tables, the collections and the indexes when it starts.

## Select a store

| `DATABASE_URI`                     | Store                                                                           | Use it for                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `postgres://…` or `postgresql://…` | PostgreSQL. The table names start with `DATABASE_TABLE_PREFIX` (default `ic_`). | Production. This is the recommended store.                                                       |
| `mongodb://…` or `mongodb+srv://…` | MongoDB. The database comes from the URL, or from `DATABASE_NAME`.              | Production.                                                                                      |
| Not set, or `memory://`            | In memory.                                                                      | Development and demos only. The data goes away when the server stops. Instances do not share it. |

To select the store without the URL scheme, set `STORE` to `memory`, `postgres` or `mongo`.

## PostgreSQL

The PostgreSQL user must be able to create tables. On PostgreSQL 15 and later, the user must own the database or have `CREATE` on its schema. The setups in the [deploy guides](/docs/deploy/choose-a-platform/) do this.

Example:

```bash
DATABASE_URI='postgres://incident:PASSWORD@db.example.com:5432/incident_command?sslmode=verify-full'
```

### TLS for PostgreSQL

The PostgreSQL client (node-postgres) treats `sslmode=require` as full certificate verification (`verify-full`). Select the mode from the way that the database certificate is issued:

| Database                                                                                                       | Add to `DATABASE_URI`                                                         |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The certificate chains to a public root, for example Azure Database for PostgreSQL Flexible Server.            | `?sslmode=verify-full`                                                        |
| The provider uses its own CA, which is not in the Node.js trust store, for example DigitalOcean or Amazon RDS. | `?uselibpqcompat=true&sslmode=require` (encrypted, the chain is not verified) |
| A Unix socket (Cloud SQL on Cloud Run) or a private network (Docker Compose).                                  | Nothing                                                                       |

## MongoDB

The server uses the database name in the URL. If the URL has no database name, set `DATABASE_NAME`.

```bash
DATABASE_URI='mongodb+srv://incident:PASSWORD@cluster0.example.mongodb.net/incident_command'
```

Amazon DocumentDB and Azure Cosmos DB for MongoDB are compatible with MongoDB, but they are not the same. Test them before you use them in production. The [AWS](/docs/deploy/aws/) and [Azure](/docs/deploy/azure/) guides give the settings.

## Connection pool

Each instance keeps its own connection pool. Make sure that the number of instances, multiplied by the pool size, stays below the connection limit of the database.

Set `DATABASE_POOL=false` to open a connection for each query (PostgreSQL) or each operation (MongoDB). Use this for a database that closes idle connections, or for a platform that freezes idle instances.

## When the database is offline

The status page keeps its last known data when the database goes offline. `/healthz` then reports `"status":"degraded"` with HTTP 200. Changes in the portal fail until the database is online again. Read [Health, cache and scale](/docs/operate/scaling/) for the details.

## Data from earlier versions

Earlier versions used the name "components" for services. On the first start after an upgrade, the server renames the old tables or collections and their fields. This occurs one time and keeps all data.

## Back up and restore

Read [Upgrades and backups](/docs/operate/upgrades/).
