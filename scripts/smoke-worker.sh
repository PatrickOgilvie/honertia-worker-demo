#!/usr/bin/env bash

set -euo pipefail

SMOKE_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/popcomputer-web-demo-smoke.XXXXXX")"
SMOKE_STATE_DIR="$SMOKE_TEMP_DIR/state"
SMOKE_LOG_FILE="$SMOKE_TEMP_DIR/wrangler.log"
SMOKE_COOKIE_FILE="$SMOKE_TEMP_DIR/cookies.txt"
SMOKE_PORT="${POPCOMPUTER_SMOKE_PORT:-18991}"
SMOKE_INSPECTOR_PORT="${POPCOMPUTER_SMOKE_INSPECTOR_PORT:-19556}"
SMOKE_ORIGIN="http://127.0.0.1:$SMOKE_PORT"
SMOKE_PROJECT_ID="550e8400-e29b-41d4-a716-446655440000"
SMOKE_WORKER_PID=""

cleanup() {
  if [[ -n "$SMOKE_WORKER_PID" ]] && kill -0 "$SMOKE_WORKER_PID" 2>/dev/null; then
    kill "$SMOKE_WORKER_PID" 2>/dev/null || true
    wait "$SMOKE_WORKER_PID" 2>/dev/null || true
  fi

  case "$SMOKE_TEMP_DIR" in
    */popcomputer-web-demo-smoke.*) rm -rf -- "$SMOKE_TEMP_DIR" ;;
  esac
}

fail() {
  printf 'Worker smoke test failed: %s\n' "$1" >&2
  if [[ -f "$SMOKE_LOG_FILE" ]]; then
    tail -80 "$SMOKE_LOG_FILE" >&2
  fi
  exit 1
}

trap cleanup EXIT INT TERM
cd "$SMOKE_ROOT_DIR"

bun run build >/dev/null
CI=1 ./node_modules/.bin/wrangler d1 migrations apply DB \
  --local \
  --persist-to "$SMOKE_STATE_DIR" >/dev/null

./node_modules/.bin/wrangler dev \
  --ip 127.0.0.1 \
  --port "$SMOKE_PORT" \
  --inspector-port "$SMOKE_INSPECTOR_PORT" \
  --persist-to "$SMOKE_STATE_DIR" \
  --show-interactive-dev-session false \
  --var 'BETTER_AUTH_SECRET:popcomputer-web-demo-smoke-secret-32-chars' \
  --var 'ENVIRONMENT:production' >"$SMOKE_LOG_FILE" 2>&1 &
SMOKE_WORKER_PID=$!

SMOKE_READY_STATUS=""
for _attempt in {1..80}; do
  SMOKE_READY_STATUS="$(
    curl --max-time 1 --silent --show-error \
      --output /dev/null \
      --write-out '%{http_code}' \
      "$SMOKE_ORIGIN/register" 2>/dev/null || true
  )"
  if [[ "$SMOKE_READY_STATUS" == "200" ]]; then
    break
  fi
  sleep 0.25
done

[[ "$SMOKE_READY_STATUS" == "200" ]] || fail 'Workerd did not become ready.'

SMOKE_REGISTER_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie-jar "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/register.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode 'name=Worker Smoke' \
    --data-urlencode 'email=worker-smoke@example.com' \
    --data-urlencode 'password=WorkerSmoke123!' \
    "$SMOKE_ORIGIN/register"
)"
[[ "$SMOKE_REGISTER_STATUS" == "303" ]] || fail 'Registration did not redirect.'

SMOKE_CREATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/create.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode "id=$SMOKE_PROJECT_ID" \
    --data-urlencode 'name=Worker smoke project' \
    --data-urlencode 'description=Exercises D1, bindings, Effect, and Workers Cache.' \
    --data-urlencode 'visibility=public' \
    "$SMOKE_ORIGIN/projects"
)"
[[ "$SMOKE_CREATE_STATUS" == "303" ]] || fail 'Project creation did not redirect.'

SMOKE_OWNER_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/project.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_OWNER_STATUS" == "200" ]] || fail 'Bound owner route did not render.'

SMOKE_PUBLIC_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --dump-header "$SMOKE_TEMP_DIR/public.headers" \
    --output "$SMOKE_TEMP_DIR/public.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/showcase/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_PUBLIC_STATUS" == "200" ]] || fail 'Public bound route did not render.'
grep --ignore-case --quiet '^Cache-Control: public, max-age=60' \
  "$SMOKE_TEMP_DIR/public.headers" || fail 'Public cache policy was not applied.'
grep --ignore-case --quiet "^Cache-Tag: project:$SMOKE_PROJECT_ID,projects" \
  "$SMOKE_TEMP_DIR/public.headers" || fail 'Binding-derived cache tags were not applied.'

SMOKE_SESSIONS_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/sessions.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/sessions"
)"
[[ "$SMOKE_SESSIONS_STATUS" == "200" ]] || fail 'Session manager did not render.'
if grep --fixed-strings --quiet '"token":' "$SMOKE_TEMP_DIR/sessions.html"; then
  fail 'A session token key reached the rendered page payload.'
fi

SMOKE_API_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/projects.json" \
    --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    "$SMOKE_ORIGIN/api/projects"
)"
[[ "$SMOKE_API_STATUS" == "200" ]] || fail 'Project JSON API did not respond.'
node -e "
  const payload = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
  if (payload.projects?.length !== 1 || payload.projects[0]?.id !== process.argv[2]) {
    process.exit(1)
  }
  if (Object.hasOwn(payload.projects[0], 'userId')) process.exit(1)
" "$SMOKE_TEMP_DIR/projects.json" "$SMOKE_PROJECT_ID" || \
  fail 'Project JSON API returned an invalid public projection.'

SMOKE_PRIVATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request PUT \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/private.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode 'name=Worker smoke project' \
    --data-urlencode 'description=Exercises D1, bindings, Effect, and Workers Cache.' \
    --data-urlencode 'visibility=private' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_PRIVATE_STATUS" == "303" ]] || fail 'Project visibility update did not redirect.'

SMOKE_AFTER_PRIVATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --output "$SMOKE_TEMP_DIR/private-public.json" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/showcase/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_AFTER_PRIVATE_STATUS" == "404" ]] || \
  fail 'A stale public response survived the visibility-change purge.'

SMOKE_DELETE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request DELETE \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/delete.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_DELETE_STATUS" == "303" ]] || fail 'Project deletion did not redirect.'

printf 'Worker smoke test passed: startup, D1, auth, bindings, cache purge, sessions, and JSON API.\n'
