---
title: Security overview
navTitle: Security overview
description: How Incident Command protects sign-in, sessions, tokens, stored secrets and webhooks, and what an operator must set.
order: 6
---

This page tells how Incident Command protects your data, and what you must set as the operator. To report a vulnerability, read the [security policy](https://github.com/jaredwray/incident-command/blob/main/SECURITY.md).

## What you must set

- Set `SETUP_TOKEN` before the server is on the internet. Read [First admin](/docs/operate/secrets/#first-admin-setup_token).
- Serve the status page and the portal over HTTPS, and set `SITE_URL` to the `https://` URL.
- Set `ENCRYPTION_KEY` before you add provider credentials or members set up authenticators.
- Keep two-factor authentication required. It is on by default.
- Keep the database on a private network, or require TLS. Read [TLS for PostgreSQL](/docs/operate/databases/#tls-for-postgresql).

## Accounts and sign-in

- The server hashes each password with scrypt. A password has at least 8 characters.
- Two-factor authentication uses an authenticator app (TOTP, RFC 6238) and recovery codes. The server keeps only a hash of each recovery code.
- A sign-in allows 5 wrong authentication codes. After that, the member must start the sign-in again.
- An admin can require two-factor authentication for all members in **Manage → Settings → General**. The requirement is on by default.
- An invite link works one time and expires after 7 days. The server keeps only a hash of the link token.

## Sessions

- A session cookie holds a random token. The server keeps only a SHA-256 hash of the token.
- The cookie is `HttpOnly` and `SameSite=Lax`.
- The cookie is `Secure` when `SITE_URL` starts with `https://`. When `SITE_URL` is not set, the cookie is `Secure` when `NODE_ENV` is `production`. The container image sets `NODE_ENV=production`.
- A session lasts for `SESSION_TTL` (default `7d`).
- Each server action reads the session and the member from the database. Thus a removed member or a changed role applies to each change of data immediately.

## Agents and tokens

- An agent has only the permissions that an admin gives it. A new agent can read the status page and write drafts. It cannot publish or notify subscribers.
- Some permissions are for people only. An agent cannot review notification drafts or manage notification providers.
- The server keeps only a hash of each API token and each OAuth token. The portal shows a new API token one time.
- OAuth requires PKCE with `S256`. An access token expires after 1 hour, and a refresh token after 30 days.
- Another site cannot show the consent page (`/manage/authorize`) in a frame.
- The portal records the activity of each agent.

Read [Agent permissions](/docs/agents/permissions/) for the full list.

## Stored secrets

- The server encrypts provider credentials and authenticator secrets with AES-256-GCM and `ENCRYPTION_KEY`.
- The portal and the MCP server never show a saved credential again.

Read [Secrets and key rotation](/docs/operate/secrets/).

## Webhooks

- A webhook posts only to public internet addresses, unless an admin allows private network addresses.
- The server does not follow redirects, and stops a request after 10 seconds.
- With `WEBHOOK_SECRET`, each request has an HMAC-SHA256 signature. Read [Webhooks](/docs/reference/webhooks/).

## The prebuilt image

- The image runs as the unprivileged `node` user.
- The release workflow builds the image from the release tag and tests it before the push. Docker Hub keeps provenance and SBOM attestations for each image.
- The server action key of the public image is public. Read [The prebuilt image](/docs/operate/secrets/#the-prebuilt-image).
