---
title: Health, cache and scale
navTitle: Health, cache and scale
description: How the health check, the read cache and the session cache work, and how to run more than one instance.
order: 4
---

Incident Command is one Node.js server. You can run one instance or many instances behind a load balancer. This page tells how the health check and the caches behave, and what to set before you add instances.

## Health check

`GET /healthz` returns JSON with no caching:

| Response                            | Meaning                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200` with `"status":"ok"`          | The server runs and the database is online.                                                                                                                 |
| `200` with `"status":"degraded"`    | The database went offline after the server started. The server serves cached data.                                                                          |
| `503` with `"status":"unavailable"` | The server cannot start: the configuration is not valid, or the database was not available at startup. The server tries to start again on the next request. |

A database outage after startup keeps the response at 200. Thus a platform does not restart instances that still serve cached data. The container image has a `HEALTHCHECK` that calls `/healthz`. Some platforms, such as Cloud Run, ignore it. On those platforms, add an HTTP probe on `/healthz`.

## Read cache

The public status data goes through an in-process cache.

- `CACHE_TTL` (default `30s`) is the time that a cached read stays fresh. After that time, the server reads the database again.
- If the database is offline, the server serves the last known data. Cached data does not expire while the database is offline.
- A write goes directly to the database and marks the cached reads stale.
- `CACHE_MAX_ENTRIES` (default `5000`) is the maximum number of entries in each instance.

The cache is in each instance. With more than one instance, the public data on an instance can be up to `CACHE_TTL` old. Set a lower `CACHE_TTL` if that is a problem.

## Session cache

Each instance keeps a resolved portal session in memory for `SESSION_CACHE_TTL` (default `30s`). Thus most portal page views do not read the session from the database.

- On the instance that gets a sign-out or a member change, the change applies immediately.
- On a different instance, a page view can use the old session or the old role for `SESSION_CACHE_TTL`, at most.
- A server action always reads the session and the member from the database. Thus an old session cannot change data.
- The server does not cache API tokens. When an admin revokes a token, the change applies immediately on all instances.

Set `SESSION_CACHE_TTL=0` to turn off the session cache.

## Run more than one instance

- Use PostgreSQL or MongoDB. Never run more than one instance on the in-memory store, because each instance then has its own data.
- Each instance keeps its own database connection pool. Make sure that the database accepts the connections of all instances. Read [Connection pool](/docs/operate/databases/#connection-pool).
- Run the same image on all instances. All instances then have the same server action key. Read [Server action key](/docs/operate/secrets/#server-action-key).
- Keep at least one instance on. A platform that stops all instances when there is no traffic makes the first request slow.

The [deploy guides](/docs/deploy/choose-a-platform/) give the settings for each platform.
