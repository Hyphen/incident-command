#!/bin/sh
# Smoke test for a built Incident Command image.
#
#   scripts/smoke-test-image.sh IMAGE
#
# The script does these checks:
#   1. It loads the qrbit native addon in the image. The two-factor pages need
#      it, and the standalone build must copy it.
#   2. It starts the image with the in-memory store and demo data.
#   3. It waits until GET /healthz reports "ok".
#   4. It gets the status page and the setup page of the portal.
#
# .github/workflows/tests.yml and .github/workflows/release-docker.yml use it.
# Set DOCKER to use a different Docker-compatible command (default: docker).
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 IMAGE" >&2
  exit 2
fi

image="$1"
docker_command="${DOCKER:-docker}"
name="incident-command-smoke-$$"
port="${SMOKE_TEST_PORT:-3999}"
base="http://127.0.0.1:${port}"

cleanup() {
  "$docker_command" rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Load the qrbit native addon"
"$docker_command" run --rm --workdir /app/packages/app --entrypoint node "$image" \
  -e "import('qrbit').then((m) => new m.QrBit({ text: 'otpauth://totp/smoke?secret=JBSWY3DPEHPK3PXP' }).toSvg()).then((svg) => process.exit(svg.includes('<svg') ? 0 : 1))"

echo "Start the image"
"$docker_command" run -d --name "$name" -p "127.0.0.1:${port}:3000" \
  -e SEED_DEMO=true -e SETUP_TOKEN=smoke-test "$image" >/dev/null

echo "Wait for /healthz"
health=""
attempt=0
while [ "$attempt" -lt 30 ]; do
  attempt=$((attempt + 1))
  if health=$(curl -fsS "${base}/healthz" 2>/dev/null); then
    break
  fi
  sleep 2
done
echo "/healthz: ${health}"

case "$health" in
*'"status":"ok"'*) ;;
*)
  echo "error: /healthz did not report ok" >&2
  "$docker_command" logs "$name" >&2 || true
  exit 1
  ;;
esac

for path in / /manage/setup; do
  echo "GET ${path}"
  if ! curl -fsS -o /dev/null "${base}${path}"; then
    echo "error: GET ${path} failed" >&2
    "$docker_command" logs "$name" >&2 || true
    exit 1
  fi
done

echo "The image passed the smoke test."
