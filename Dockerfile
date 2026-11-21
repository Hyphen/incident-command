# syntax=docker/dockerfile:1

# Incident Command container image (Next.js standalone server).
#
#   docker build -t incident-command .
#   docker run -p 3000:3000 \
#     -e DATABASE_URI=postgres://user:pass@db-host:5432/incident_command \
#     -e SITE_URL=http://localhost:3000 \
#     incident-command
#
# The repository is a pnpm workspace. Build from the repository root: the
# image needs the root lockfile and pnpm-workspace.yaml. The app is in
# packages/app.
#
# See https://incident-command.org/docs/reference/environment-variables for
# every environment variable.

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# Build: install dependencies with corepack-managed pnpm and run `next build`.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build

# libc6-compat: recommended by Next.js for native modules on Alpine (musl).
RUN apk add --no-cache libc6-compat && corepack enable

# MONGOMS_DISABLE_POSTINSTALL: mongodb-memory-server (a test-only devDependency)
# would otherwise download a ~120MB MongoDB binary in its postinstall script.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    MONGOMS_DISABLE_POSTINSTALL=1

WORKDIR /app

# pnpm-workspace.yaml carries `allowBuilds`, so it must sit next to the lockfile.
# Copy each workspace manifest so that the frozen lockfile matches. Install only
# the app and its dependencies, not the documentation site.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/app/package.json ./packages/app/
COPY packages/website/package.json ./packages/website/
RUN pnpm install --frozen-lockfile --filter @incident-command/app...

COPY packages/app ./packages/app

# Next.js salts the server action ids with this key. Pass the same key to each
# build so the ids stay the same between deploys. `next build` writes the key
# into the image files. See
# https://incident-command.org/docs/operate/secrets.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY}
RUN pnpm --filter @incident-command/app build

# ---------------------------------------------------------------------------
# Runtime: only the standalone server, static assets and public files.
# The standalone output keeps the workspace layout, so the server is at
# packages/app/server.js.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime

LABEL org.opencontainers.image.title="incident-command" \
      org.opencontainers.image.description="Status page, management portal and MCP server for incident command" \
      org.opencontainers.image.source="https://github.com/jaredwray/incident-command" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=build --chown=node:node /app/packages/app/.next/standalone ./
COPY --from=build --chown=node:node /app/packages/app/.next/static ./packages/app/.next/static
COPY --from=build --chown=node:node /app/packages/app/public ./packages/app/public

# The official Node image ships an unprivileged `node` user (uid 1000).
USER node

EXPOSE 3000

# Alpine has no curl; use Node's built-in fetch. /healthz returns 503 only
# when the app cannot start; a database outage after boot reports "degraded"
# with a 200 while cached data keeps being served.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "packages/app/server.js"]
