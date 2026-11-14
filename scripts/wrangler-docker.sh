#!/bin/sh
# Docker command for `wrangler deploy` and `wrangler dev` (WRANGLER_DOCKER_BIN).
#
# Wrangler builds the container image with `docker build`. It gives only the
# build_vars of wrangler.jsonc to the build, and that file is not secret. This
# script adds the NEXT_SERVER_ACTIONS_ENCRYPTION_KEY build argument from the
# environment. Docker reads the value from the environment, so the key is not
# in the command line or in a file. The Dockerfile uses the key only in its
# build stage, so the key is not in the history of the final image. But
# `next build` writes the key into the server action manifest, so the key is
# in the files of the image.
#
# Set DOCKER to use a different Docker-compatible command (default: docker).
set -eu

docker_command="${DOCKER:-docker}"

if [ "${1:-}" = "build" ] && [ -n "${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:-}" ]; then
  shift
  exec "$docker_command" build --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY "$@"
fi

exec "$docker_command" "$@"
