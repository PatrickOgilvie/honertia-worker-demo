#!/usr/bin/env bash

set -euo pipefail

SMOKE_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/popcomputer-web-demo-smoke.XXXXXX")"
SMOKE_STATE_DIR="$SMOKE_TEMP_DIR/state"
SMOKE_LOG_FILE="$SMOKE_TEMP_DIR/wrangler.log"
SMOKE_COOKIE_FILE="$SMOKE_TEMP_DIR/cookies.txt"
SMOKE_REPLAY_COOKIE_FILE="$SMOKE_TEMP_DIR/replay-cookies.txt"
SMOKE_SECOND_SESSION_COOKIE_FILE="$SMOKE_TEMP_DIR/second-session-cookies.txt"
SMOKE_THIRD_SESSION_COOKIE_FILE="$SMOKE_TEMP_DIR/third-session-cookies.txt"
SMOKE_OTHER_USER_COOKIE_FILE="$SMOKE_TEMP_DIR/other-user-cookies.txt"
SMOKE_TRIMMED_LOGIN_COOKIE_FILE="$SMOKE_TEMP_DIR/trimmed-login-cookies.txt"
SMOKE_CAP_OLDEST_COOKIE_FILE="$SMOKE_TEMP_DIR/session-cap-oldest-cookies.txt"
SMOKE_SESSION_LIMIT=5
SMOKE_PORT="${POPCOMPUTER_SMOKE_PORT:-$((18000 + $$ % 10000))}"
SMOKE_INSPECTOR_PORT="${POPCOMPUTER_SMOKE_INSPECTOR_PORT:-$((38000 + $$ % 10000))}"
SMOKE_ORIGIN="http://127.0.0.1:$SMOKE_PORT"
SMOKE_PROJECT_ID="550e8400-e29b-41d4-a716-446655440000"
SMOKE_MISSING_PROJECT_ID="550e8400-e29b-41d4-a716-446655440001"
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

assert_redirect_to_login() {
  local status="$1"
  local headers_file="$2"
  local description="$3"

  if [[ "$status" != "302" && "$status" != "303" ]]; then
    fail "$description did not redirect to login."
  fi
  grep --extended-regexp --ignore-case --quiet \
    '^Location: (https?://[^/]+)?/login([?#].*|[[:space:]]*)$' \
    "$headers_file" || \
    fail "$description redirected somewhere other than login."
}

assert_raw_auth_blocked() {
  local method="$1"
  local path="$2"
  local output_file="$SMOKE_TEMP_DIR/raw-auth-${path//\//-}.json"
  local status

  if [[ "$method" == "POST" ]]; then
    status="$(
      curl --max-time 10 --silent --show-error \
        --request POST \
        --cookie "$SMOKE_COOKIE_FILE" \
        --output "$output_file" \
        --write-out '%{http_code}' \
        --header 'Content-Type: application/json' \
        --data-binary '{}' \
        "$SMOKE_ORIGIN/api/auth/$path"
    )"
  else
    status="$(
      curl --max-time 10 --silent --show-error \
        --cookie "$SMOKE_COOKIE_FILE" \
        --output "$output_file" \
        --write-out '%{http_code}' \
        "$SMOKE_ORIGIN/api/auth/$path"
    )"
  fi

  [[ "$status" == "404" ]] || \
    fail "Raw Better Auth endpoint $path was externally reachable."
  if grep --fixed-strings --quiet '"token"' "$output_file"; then
    fail "Raw Better Auth endpoint $path exposed a token."
  fi
}

trap cleanup EXIT INT TERM
cd "$SMOKE_ROOT_DIR"

bun run build >/dev/null
CI=1 ./node_modules/.bin/wrangler d1 migrations apply DB \
  --local \
  --persist-to "$SMOKE_STATE_DIR" >/dev/null

node ./node_modules/wrangler/wrangler-dist/cli.js dev \
  --ip 127.0.0.1 \
  --port "$SMOKE_PORT" \
  --inspector-port "$SMOKE_INSPECTOR_PORT" \
  --persist-to "$SMOKE_STATE_DIR" \
  --show-interactive-dev-session false \
  --var 'BETTER_AUTH_SECRET:popcomputer-web-demo-smoke-secret-32-chars' \
  --var 'ENVIRONMENT:production' \
  --var "APP_ORIGIN:$SMOKE_ORIGIN" >"$SMOKE_LOG_FILE" 2>&1 &
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

SMOKE_UNAUTH_MALFORMED_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --dump-header "$SMOKE_TEMP_DIR/unauth-malformed.headers" \
    --output "$SMOKE_TEMP_DIR/unauth-malformed.html" \
    --write-out '%{http_code}' \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/projects/not-a-project-id"
)"
assert_redirect_to_login \
  "$SMOKE_UNAUTH_MALFORMED_STATUS" \
  "$SMOKE_TEMP_DIR/unauth-malformed.headers" \
  'An unauthenticated request with a malformed project ID'
grep --ignore-case --quiet '^Cache-Control: no-store' \
  "$SMOKE_TEMP_DIR/unauth-malformed.headers" || \
  fail 'An authentication redirect from a protected route was cacheable.'

SMOKE_REGISTER_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie-jar "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/register.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.1' \
    --header 'Accept: text/html' \
    --data-urlencode 'name=Worker Smoke' \
    --data-urlencode 'email=worker-smoke@example.com' \
    --data-urlencode 'password=  WorkerSmoke123!  ' \
    "$SMOKE_ORIGIN/register"
)"
if [[ "$SMOKE_REGISTER_STATUS" != "303" ]]; then
  fail "Registration did not redirect (received $SMOKE_REGISTER_STATUS)."
fi

assert_raw_auth_blocked GET get-session
assert_raw_auth_blocked GET list-sessions
assert_raw_auth_blocked POST sign-in/email

node -e "
  process.stdout.write(
    'email=oversized%40example.com&password=' + 'x'.repeat(9000)
  )
" >"$SMOKE_TEMP_DIR/oversized-form.txt"
SMOKE_OVERSIZED_FORM_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request POST \
    --output "$SMOKE_TEMP_DIR/oversized-form-response.txt" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.220' \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data-binary "@$SMOKE_TEMP_DIR/oversized-form.txt" \
    "$SMOKE_ORIGIN/login"
)"
[[ "$SMOKE_OVERSIZED_FORM_STATUS" == "413" ]] || \
  fail 'An oversized credential form was not rejected before authentication.'

node -e "
  process.stdout.write(JSON.stringify({
    name: 'Oversized',
    email: 'oversized@example.com',
    password: 'x'.repeat(9000),
  }))
" >"$SMOKE_TEMP_DIR/oversized.json"
SMOKE_OVERSIZED_JSON_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request POST \
    --output "$SMOKE_TEMP_DIR/oversized-json-response.txt" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.221' \
    --header 'Content-Type: application/json' \
    --data-binary "@$SMOKE_TEMP_DIR/oversized.json" \
    "$SMOKE_ORIGIN/register"
)"
[[ "$SMOKE_OVERSIZED_JSON_STATUS" == "413" ]] || \
  fail 'An oversized credential JSON body was not rejected before authentication.'

SMOKE_UNAUTH_OVERSIZED_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request POST \
    --dump-header "$SMOKE_TEMP_DIR/unauth-oversized.headers" \
    --output "$SMOKE_TEMP_DIR/unauth-oversized.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data-binary "@$SMOKE_TEMP_DIR/oversized-form.txt" \
    "$SMOKE_ORIGIN/projects"
)"
assert_redirect_to_login \
  "$SMOKE_UNAUTH_OVERSIZED_STATUS" \
  "$SMOKE_TEMP_DIR/unauth-oversized.headers" \
  'An unauthenticated oversized project mutation'

SMOKE_SECOND_SESSION_LOGIN_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie-jar "$SMOKE_SECOND_SESSION_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/second-session-login.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.3' \
    --header 'Accept: text/html' \
    --data-urlencode 'email=worker-smoke@example.com' \
    --data-urlencode 'password=  WorkerSmoke123!  ' \
    "$SMOKE_ORIGIN/login"
)"
[[ "$SMOKE_SECOND_SESSION_LOGIN_STATUS" == "303" ]] || \
  fail 'The second session login did not redirect.'

SMOKE_THIRD_SESSION_LOGIN_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie-jar "$SMOKE_THIRD_SESSION_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/third-session-login.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.4' \
    --header 'Accept: text/html' \
    --data-urlencode 'email=worker-smoke@example.com' \
    --data-urlencode 'password=  WorkerSmoke123!  ' \
    "$SMOKE_ORIGIN/login"
)"
[[ "$SMOKE_THIRD_SESSION_LOGIN_STATUS" == "303" ]] || \
  fail 'The third session login did not redirect.'

SMOKE_SESSION_PAGE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_SECOND_SESSION_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/second-session-page.json" \
    --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    --header 'X-Inertia: true' \
    "$SMOKE_ORIGIN/sessions"
)"
[[ "$SMOKE_SESSION_PAGE_STATUS" == "200" ]] || \
  fail 'The session manager did not return an Inertia page object.'
if grep --fixed-strings --quiet '"token"' \
  "$SMOKE_TEMP_DIR/second-session-page.json"; then
  fail 'A session token key reached the Inertia page payload.'
fi
SMOKE_SECOND_SESSION_ID="$(
  node -e "
    const page = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
    const sessions = page.props?.sessions
    const current = Array.isArray(sessions)
      ? sessions.find((session) => session?.isCurrent === true)
      : undefined
    if (typeof current?.id !== 'string') process.exit(1)
    process.stdout.write(current.id)
  " "$SMOKE_TEMP_DIR/second-session-page.json"
)" || fail 'The current second-session identifier was not projected.'

SMOKE_REVOKE_ONE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request POST \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/revoke-one.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.7' \
    --header 'Accept: text/html' \
    --data-urlencode "sessionId=$SMOKE_SECOND_SESSION_ID" \
    "$SMOKE_ORIGIN/sessions/revoke"
)"
[[ "$SMOKE_REVOKE_ONE_STATUS" == "303" ]] || \
  fail 'Revoking one other session did not redirect.'

SMOKE_REVOKED_ONE_REPLAY_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_SECOND_SESSION_COOKIE_FILE" \
    --dump-header "$SMOKE_TEMP_DIR/revoked-one-replay.headers" \
    --output "$SMOKE_TEMP_DIR/revoked-one-replay.html" \
    --write-out '%{http_code}' \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/sessions"
)"
assert_redirect_to_login \
  "$SMOKE_REVOKED_ONE_REPLAY_STATUS" \
  "$SMOKE_TEMP_DIR/revoked-one-replay.headers" \
  'A replay of the individually revoked session'

SMOKE_REVOKE_OTHERS_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request POST \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/revoke-others.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/sessions/revoke-others"
)"
[[ "$SMOKE_REVOKE_OTHERS_STATUS" == "303" ]] || \
  fail 'Revoking every other session did not redirect.'

SMOKE_REVOKED_OTHERS_REPLAY_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_THIRD_SESSION_COOKIE_FILE" \
    --dump-header "$SMOKE_TEMP_DIR/revoked-others-replay.headers" \
    --output "$SMOKE_TEMP_DIR/revoked-others-replay.html" \
    --write-out '%{http_code}' \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/sessions"
)"
assert_redirect_to_login \
  "$SMOKE_REVOKED_OTHERS_REPLAY_STATUS" \
  "$SMOKE_TEMP_DIR/revoked-others-replay.headers" \
  'A replay of a session revoked by revoke-others'

SMOKE_CURRENT_SESSION_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/current-session-still-active.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/sessions"
)"
[[ "$SMOKE_CURRENT_SESSION_STATUS" == "200" ]] || \
  fail 'Revoking other sessions ended the current session.'

SMOKE_RATE_PIDS=()
for SMOKE_RATE_ATTEMPT in {1..8}; do
  (
    curl --max-time 20 --silent --show-error \
      --dump-header "$SMOKE_TEMP_DIR/login-rate-$SMOKE_RATE_ATTEMPT.headers" \
      --output "$SMOKE_TEMP_DIR/login-rate-$SMOKE_RATE_ATTEMPT.html" \
      --write-out '%{http_code}' \
      --header "Origin: $SMOKE_ORIGIN" \
      --header 'CF-Connecting-IP: 192.0.2.200' \
      --header 'Accept: text/html' \
      --data-urlencode 'email=worker-smoke@example.com' \
      --data-urlencode 'password=not-the-password' \
      "$SMOKE_ORIGIN/login" \
      >"$SMOKE_TEMP_DIR/login-rate-$SMOKE_RATE_ATTEMPT.status"
  ) &
  SMOKE_RATE_PIDS+=("$!")
done
for SMOKE_RATE_PID in "${SMOKE_RATE_PIDS[@]}"; do
  wait "$SMOKE_RATE_PID"
done
node -e "
  const fs = require('node:fs')
  const directory = process.argv[1]
  const statuses = Array.from({ length: 8 }, (_, index) =>
    fs.readFileSync(directory + '/login-rate-' + (index + 1) + '.status', 'utf8').trim()
  )
  if (statuses.filter((status) => status === '429').length !== 5) process.exit(1)
" "$SMOKE_TEMP_DIR" || \
  fail 'Concurrent login attempts did not honor the atomic three-attempt limit.'
grep --extended-regexp --ignore-case --quiet \
  '^X-Retry-After: [0-9]+' "$SMOKE_TEMP_DIR"/login-rate-*.headers || \
  fail 'A rate-limited login did not include retry guidance.'

SMOKE_RATE_PIDS=()
for SMOKE_RATE_ATTEMPT in {1..8}; do
  (
    curl --max-time 20 --silent --show-error \
      --dump-header "$SMOKE_TEMP_DIR/register-rate-$SMOKE_RATE_ATTEMPT.headers" \
      --output "$SMOKE_TEMP_DIR/register-rate-$SMOKE_RATE_ATTEMPT.html" \
      --write-out '%{http_code}' \
      --header "Origin: $SMOKE_ORIGIN" \
      --header 'CF-Connecting-IP: 192.0.2.201' \
      --header 'Accept: text/html' \
      --data-urlencode 'name=Already Registered' \
      --data-urlencode 'email=worker-smoke@example.com' \
      --data-urlencode 'password=AnotherWorkerSmoke123!' \
      "$SMOKE_ORIGIN/register" \
      >"$SMOKE_TEMP_DIR/register-rate-$SMOKE_RATE_ATTEMPT.status"
  ) &
  SMOKE_RATE_PIDS+=("$!")
done
for SMOKE_RATE_PID in "${SMOKE_RATE_PIDS[@]}"; do
  wait "$SMOKE_RATE_PID"
done
node -e "
  const fs = require('node:fs')
  const directory = process.argv[1]
  const statuses = Array.from({ length: 8 }, (_, index) =>
    fs.readFileSync(directory + '/register-rate-' + (index + 1) + '.status', 'utf8').trim()
  )
  if (statuses.filter((status) => status === '429').length !== 5) process.exit(1)
" "$SMOKE_TEMP_DIR" || \
  fail 'Concurrent registrations did not honor the atomic three-attempt limit.'

SMOKE_AUTH_MALFORMED_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/auth-malformed.html" \
    --write-out '%{http_code}' \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/projects/not-a-project-id"
)"
[[ "$SMOKE_AUTH_MALFORMED_STATUS" == "404" ]] || \
  fail 'An authenticated malformed project ID was not concealed as not found.'

SMOKE_CREATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/create.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode "id=$SMOKE_PROJECT_ID" \
    --data-urlencode 'name=Worker smoke project' \
    --data-urlencode 'description=Exercises D1, bindings, Effect, and Workerd.' \
    --data-urlencode 'visibility=public' \
    "$SMOKE_ORIGIN/projects"
)"
[[ "$SMOKE_CREATE_STATUS" == "303" ]] || fail 'Project creation did not redirect.'

SMOKE_REPLAY_CREATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/replay-create.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode "id=$SMOKE_PROJECT_ID" \
    --data-urlencode 'name=This replay must not overwrite the first write' \
    --data-urlencode 'description=Different replayed content.' \
    --data-urlencode 'visibility=private' \
    "$SMOKE_ORIGIN/projects"
)"
[[ "$SMOKE_REPLAY_CREATE_STATUS" == "303" ]] || \
  fail 'A retry-safe project creation replay did not redirect.'

SMOKE_OWNER_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --dump-header "$SMOKE_TEMP_DIR/project.headers" \
    --output "$SMOKE_TEMP_DIR/project.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_OWNER_STATUS" == "200" ]] || fail 'Owner-scoped route did not render.'
grep --ignore-case --quiet '^Cache-Control: no-store' \
  "$SMOKE_TEMP_DIR/project.headers" || \
  fail 'An authenticated project response was cacheable.'

SMOKE_SECOND_REGISTER_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie-jar "$SMOKE_OTHER_USER_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/second-register.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.2' \
    --header 'Accept: text/html' \
    --data-urlencode 'name=Second Worker User' \
    --data-urlencode 'email=second-worker-smoke@example.com' \
    --data-urlencode 'password=SecondWorkerSmoke123!' \
    "$SMOKE_ORIGIN/register"
)"
[[ "$SMOKE_SECOND_REGISTER_STATUS" == "303" ]] || \
  fail 'Second-user registration did not redirect.'

SMOKE_NONOWNER_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_OTHER_USER_COOKIE_FILE" \
    --dump-header "$SMOKE_TEMP_DIR/nonowner.headers" \
    --output "$SMOKE_TEMP_DIR/nonowner.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_NONOWNER_STATUS" == "404" ]] || \
  fail 'A non-owner could distinguish or access another user project.'
grep --ignore-case --quiet '^Cache-Control: no-store' \
  "$SMOKE_TEMP_DIR/nonowner.headers" || \
  fail 'A protected not-found response was cacheable.'

SMOKE_AUTH_UNMATCHED_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --dump-header "$SMOKE_TEMP_DIR/auth-unmatched.headers" \
    --output "$SMOKE_TEMP_DIR/auth-unmatched.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID/extra"
)"
[[ "$SMOKE_AUTH_UNMATCHED_STATUS" == "404" ]] || \
  fail 'An authenticated unmatched route did not return not found.'
grep --ignore-case --quiet '^Cache-Control: no-store' \
  "$SMOKE_TEMP_DIR/auth-unmatched.headers" || \
  fail 'An authenticated unmatched response was cacheable.'

SMOKE_NONOWNER_OVERSIZED_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request PUT \
    --cookie "$SMOKE_OTHER_USER_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/nonowner-oversized.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data-binary "@$SMOKE_TEMP_DIR/oversized-form.txt" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_NONOWNER_OVERSIZED_STATUS" == "404" ]] || \
  fail 'A non-owner request body was read before the owner-scoped lookup.'

SMOKE_MISSING_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_OTHER_USER_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/missing.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/projects/$SMOKE_MISSING_PROJECT_ID"
)"
[[ "$SMOKE_MISSING_STATUS" == "$SMOKE_NONOWNER_STATUS" ]] || \
  fail 'Missing and non-owned projects did not share the same HTTP outcome.'

SMOKE_PUBLIC_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --dump-header "$SMOKE_TEMP_DIR/public.headers" \
    --output "$SMOKE_TEMP_DIR/public.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/showcase/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_PUBLIC_STATUS" == "200" ]] || fail 'Public bound route did not render.'
grep --ignore-case --quiet '^Cache-Control: no-store' \
  "$SMOKE_TEMP_DIR/public.headers" || \
  fail 'The visibility-mutable public project route was not marked no-store.'
if grep --ignore-case --quiet '^Cache-Tag:' "$SMOKE_TEMP_DIR/public.headers"; then
  fail 'The visibility-mutable public project route exposed edge-cache tags.'
fi

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
  if (payload.projects[0]?.name !== process.argv[3]) process.exit(1)
  if (Object.hasOwn(payload.projects[0], 'userId')) process.exit(1)
" "$SMOKE_TEMP_DIR/projects.json" "$SMOKE_PROJECT_ID" 'Worker smoke project' || \
  fail 'Project JSON API returned an invalid public projection.'

SMOKE_EDIT_CONTEXT_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/edit-context.json" \
    --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    --header 'X-Inertia: true' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID/edit"
)"
[[ "$SMOKE_EDIT_CONTEXT_STATUS" == "200" ]] || \
  fail 'The edit route did not return its project revision.'
SMOKE_PROJECT_REVISION="$(
  node -e "
    const page = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
    const revision = page.props?.project?.revision
    if (!Number.isSafeInteger(revision) || revision < 1) process.exit(1)
    process.stdout.write(String(revision))
  " "$SMOKE_TEMP_DIR/edit-context.json"
)" || fail 'The edit route omitted its project revision.'

SMOKE_INVALID_JSON_UPDATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request PUT \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/invalid-update.json" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: application/json' \
    --header 'Content-Type: application/json' \
    --data-binary '{"name":"Incomplete JSON update"}' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_INVALID_JSON_UPDATE_STATUS" == "422" ]] || \
  fail 'A schema-invalid JSON project update did not return HTTP 422.'

SMOKE_PRIVATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request PUT \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/private.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode 'name=Worker smoke project' \
    --data-urlencode 'description=Exercises D1, bindings, Effect, and Workerd.' \
    --data-urlencode 'visibility=private' \
    --data-urlencode "expectedRevision=$SMOKE_PROJECT_REVISION" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_PRIVATE_STATUS" == "303" ]] || fail 'Project visibility update did not redirect.'

SMOKE_SECOND_EDIT_CONTEXT_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/second-edit-context.json" \
    --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    --header 'X-Inertia: true' \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID/edit"
)"
[[ "$SMOKE_SECOND_EDIT_CONTEXT_STATUS" == "200" ]] || \
  fail 'The edit route did not return the advanced project revision.'
SMOKE_SECOND_PROJECT_REVISION="$(
  node -e "
    const page = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
    const revision = page.props?.project?.revision
    if (revision !== Number(process.argv[2]) + 1) process.exit(1)
    process.stdout.write(String(revision))
  " "$SMOKE_TEMP_DIR/second-edit-context.json" "$SMOKE_PROJECT_REVISION"
)" || fail 'The first project update did not advance its revision.'

SMOKE_SECOND_UPDATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request PUT \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/second-update.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode 'name=Worker smoke project twice' \
    --data-urlencode 'description=Second successful update under the same revision protocol.' \
    --data-urlencode 'visibility=private' \
    --data-urlencode "expectedRevision=$SMOKE_SECOND_PROJECT_REVISION" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_SECOND_UPDATE_STATUS" == "303" ]] || \
  fail 'A second immediate project update did not redirect.'

SMOKE_STALE_UPDATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request PUT \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/stale-update.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --header 'X-Inertia: true' \
    --data-urlencode 'name=Stale overwrite must not win' \
    --data-urlencode 'description=Stale revision.' \
    --data-urlencode 'visibility=public' \
    --data-urlencode "expectedRevision=$SMOKE_PROJECT_REVISION" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_STALE_UPDATE_STATUS" == "200" ]] || \
  fail 'An Inertia stale update did not return the edit form.'
node -e "
  const page = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
  if (page.component !== 'Projects/Edit') process.exit(1)
  if (typeof page.props?.errors?.expectedRevision !== 'string') process.exit(1)
  if (page.props?.project?.revision !== Number(process.argv[2]) + 2) process.exit(1)
" "$SMOKE_TEMP_DIR/stale-update.html" "$SMOKE_PROJECT_REVISION" || \
  fail 'An Inertia stale update did not return a reloadable conflict state.'
SMOKE_CURRENT_PROJECT_REVISION="$(
  node -e "
    const page = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
    const revision = page.props?.project?.revision
    if (!Number.isSafeInteger(revision) || revision < 1) process.exit(1)
    process.stdout.write(String(revision))
  " "$SMOKE_TEMP_DIR/stale-update.html"
)" || fail 'The stale-update response omitted the current project revision.'

SMOKE_JSON_STALE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request PUT \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/stale-update.json" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: application/json' \
    --header 'Content-Type: application/json' \
    --data-binary "{\"name\":\"Stale JSON overwrite\",\"description\":\"Stale revision.\",\"visibility\":\"public\",\"expectedRevision\":$SMOKE_PROJECT_REVISION}" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_JSON_STALE_STATUS" == "409" ]] || \
  fail 'A JSON stale project update was not rejected with HTTP 409.'

SMOKE_AFTER_PRIVATE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --dump-header "$SMOKE_TEMP_DIR/private-public.headers" \
    --output "$SMOKE_TEMP_DIR/private-public.json" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/showcase/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_AFTER_PRIVATE_STATUS" == "404" ]] || \
  fail 'A private project remained visible on the uncached public route.'
grep --ignore-case --quiet '^Cache-Control: no-store' \
  "$SMOKE_TEMP_DIR/private-public.headers" || \
  fail 'The private showcase response was not marked no-store.'

SMOKE_STALE_DELETE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request DELETE \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/stale-delete.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --header 'X-Inertia: true' \
    --data-urlencode "expectedRevision=$SMOKE_PROJECT_REVISION" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_STALE_DELETE_STATUS" == "200" ]] || \
  fail 'An Inertia stale delete did not return the project page.'
node -e "
  const page = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
  if (page.component !== 'Projects/Show') process.exit(1)
  if (typeof page.props?.errors?.expectedRevision !== 'string') process.exit(1)
  if (page.props?.project?.revision !== Number(process.argv[2])) process.exit(1)
" "$SMOKE_TEMP_DIR/stale-delete.html" "$SMOKE_CURRENT_PROJECT_REVISION" || \
  fail 'An Inertia stale delete did not return a reloadable conflict state.'

SMOKE_JSON_STALE_DELETE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request DELETE \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/stale-delete.json" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: application/json' \
    --header 'Content-Type: application/json' \
    --data-binary "{\"expectedRevision\":$SMOKE_PROJECT_REVISION}" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_JSON_STALE_DELETE_STATUS" == "409" ]] || \
  fail 'A JSON stale project delete was not rejected with HTTP 409.'

SMOKE_DELETE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request DELETE \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/delete.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode "expectedRevision=$SMOKE_CURRENT_PROJECT_REVISION" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_DELETE_STATUS" == "303" ]] || fail 'Project deletion did not redirect.'

SMOKE_DELETED_PUBLIC_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --dump-header "$SMOKE_TEMP_DIR/deleted-public.headers" \
    --output "$SMOKE_TEMP_DIR/deleted-public.html" \
    --write-out '%{http_code}' \
    "$SMOKE_ORIGIN/showcase/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_DELETED_PUBLIC_STATUS" == "404" ]] || \
  fail 'A deleted project remained visible on the public route.'
grep --ignore-case --quiet '^Cache-Control: no-store' \
  "$SMOKE_TEMP_DIR/deleted-public.headers" || \
  fail 'The deleted showcase response was not marked no-store.'

SMOKE_REPEAT_DELETE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request DELETE \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/repeat-delete.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: text/html' \
    --data-urlencode "expectedRevision=$SMOKE_CURRENT_PROJECT_REVISION" \
    "$SMOKE_ORIGIN/projects/$SMOKE_PROJECT_ID"
)"
[[ "$SMOKE_REPEAT_DELETE_STATUS" == "404" ]] || \
  fail 'An already-absent project delete did not preserve the concealed not-found outcome.'

SMOKE_RESURRECT_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/resurrect.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: application/json' \
    --data-urlencode "id=$SMOKE_PROJECT_ID" \
    --data-urlencode 'name=Resurrection must fail' \
    --data-urlencode 'description=A retired identity cannot be reused.' \
    --data-urlencode 'visibility=public' \
    "$SMOKE_ORIGIN/projects"
)"
[[ "$SMOKE_RESURRECT_STATUS" == "409" ]] || \
  fail 'A retired project identifier was reusable after deletion.'

SMOKE_AFTER_DELETE_API_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/projects-after-delete.json" \
    --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    "$SMOKE_ORIGIN/api/projects"
)"
[[ "$SMOKE_AFTER_DELETE_API_STATUS" == "200" ]] || \
  fail 'The project JSON API failed after retirement.'
node -e "
  const payload = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
  if (!Array.isArray(payload.projects) || payload.projects.length !== 0) process.exit(1)
" "$SMOKE_TEMP_DIR/projects-after-delete.json" || \
  fail 'A retired project remained in its owner collection.'

# The retired identifier above consumes one lifetime slot. Fill the other 99
# through the real HTTP adapter, then prove the database quota becomes a typed
# application conflict rather than an unbounded insert or generic failure.
for SMOKE_QUOTA_INDEX in {1..99}; do
  printf -v SMOKE_QUOTA_ID \
    '00000000-0000-4000-8000-%012x' "$SMOKE_QUOTA_INDEX"
  SMOKE_QUOTA_CREATE_STATUS="$(
    curl --max-time 10 --silent --show-error \
      --cookie "$SMOKE_COOKIE_FILE" \
      --output /dev/null \
      --write-out '%{http_code}' \
      --header "Origin: $SMOKE_ORIGIN" \
      --header 'Accept: text/html' \
      --data-urlencode "id=$SMOKE_QUOTA_ID" \
      --data-urlencode "name=Quota project $SMOKE_QUOTA_INDEX" \
      --data-urlencode 'description=Bounds account project storage.' \
      --data-urlencode 'visibility=private' \
      "$SMOKE_ORIGIN/projects"
  )"
  [[ "$SMOKE_QUOTA_CREATE_STATUS" == "303" ]] || \
    fail "Project lifetime quota setup failed at item $SMOKE_QUOTA_INDEX."
done

SMOKE_OVER_QUOTA_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/over-project-quota.json" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'Accept: application/json' \
    --data-urlencode 'id=00000000-0000-4000-8000-000000000100' \
    --data-urlencode 'name=One project too many' \
    --data-urlencode 'description=Must be rejected atomically.' \
    --data-urlencode 'visibility=private' \
    "$SMOKE_ORIGIN/projects"
)"
[[ "$SMOKE_OVER_QUOTA_STATUS" == "409" ]] || \
  fail 'The project lifetime quota was not exposed as HTTP 409.'

SMOKE_BOUNDED_PROJECTS_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/bounded-projects.json" \
    --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    "$SMOKE_ORIGIN/api/projects"
)"
[[ "$SMOKE_BOUNDED_PROJECTS_STATUS" == "200" ]] || \
  fail 'The bounded project collection did not respond.'
node -e "
  const payload = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
  if (!Array.isArray(payload.projects) || payload.projects.length !== 99) process.exit(1)
" "$SMOKE_TEMP_DIR/bounded-projects.json" || \
  fail 'The project collection did not remain within its hard response bound.'

cp "$SMOKE_COOKIE_FILE" "$SMOKE_REPLAY_COOKIE_FILE"

SMOKE_LOGOUT_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --request POST \
    --cookie "$SMOKE_COOKIE_FILE" \
    --cookie-jar "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/logout.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.5' \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/logout"
)"
[[ "$SMOKE_LOGOUT_STATUS" == "303" ]] || fail 'Logout did not redirect.'

SMOKE_REPLAY_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_REPLAY_COOKIE_FILE" \
    --dump-header "$SMOKE_TEMP_DIR/replay.headers" \
    --output "$SMOKE_TEMP_DIR/replay.html" \
    --write-out '%{http_code}' \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/sessions"
)"
assert_redirect_to_login \
  "$SMOKE_REPLAY_STATUS" \
  "$SMOKE_TEMP_DIR/replay.headers" \
  'A replay of the pre-logout session cookie'

SMOKE_TRIMMED_LOGIN_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie-jar "$SMOKE_TRIMMED_LOGIN_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/trimmed-login.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.6' \
    --header 'Accept: text/html' \
    --data-urlencode 'email=worker-smoke@example.com' \
    --data-urlencode 'password=WorkerSmoke123!' \
    "$SMOKE_ORIGIN/login"
)"
[[ "$SMOKE_TRIMMED_LOGIN_STATUS" != "303" ]] || \
  fail 'A whitespace-significant password was silently trimmed.'

SMOKE_SPACED_LOGIN_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie-jar "$SMOKE_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/spaced-login.html" \
    --write-out '%{http_code}' \
    --header "Origin: $SMOKE_ORIGIN" \
    --header 'CF-Connecting-IP: 192.0.2.8' \
    --header 'Accept: text/html' \
    --data-urlencode 'email=worker-smoke@example.com' \
    --data-urlencode 'password=  WorkerSmoke123!  ' \
    "$SMOKE_ORIGIN/login"
)"
[[ "$SMOKE_SPACED_LOGIN_STATUS" == "303" ]] || \
  fail 'The exact whitespace-significant password did not authenticate.'

cp "$SMOKE_COOKIE_FILE" "$SMOKE_CAP_OLDEST_COOKIE_FILE"
sleep 1
SMOKE_CAP_CURRENT_COOKIE_FILE=""
for ((SMOKE_SESSION_INDEX = 1; SMOKE_SESSION_INDEX <= SMOKE_SESSION_LIMIT; SMOKE_SESSION_INDEX += 1)); do
  SMOKE_CAP_CURRENT_COOKIE_FILE="$SMOKE_TEMP_DIR/session-cap-$SMOKE_SESSION_INDEX-cookies.txt"
  SMOKE_CAP_LOGIN_STATUS="$(
    curl --max-time 10 --silent --show-error \
      --cookie-jar "$SMOKE_CAP_CURRENT_COOKIE_FILE" \
      --output "$SMOKE_TEMP_DIR/session-cap-$SMOKE_SESSION_INDEX-login.html" \
      --write-out '%{http_code}' \
      --header "Origin: $SMOKE_ORIGIN" \
      --header "CF-Connecting-IP: 192.0.2.$((30 + SMOKE_SESSION_INDEX))" \
      --header 'Accept: text/html' \
      --data-urlencode 'email=worker-smoke@example.com' \
      --data-urlencode 'password=  WorkerSmoke123!  ' \
      "$SMOKE_ORIGIN/login"
  )"
  [[ "$SMOKE_CAP_LOGIN_STATUS" == "303" ]] || \
    fail "Session-cap login $SMOKE_SESSION_INDEX did not redirect."
done

SMOKE_CAP_PAGE_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_CAP_CURRENT_COOKIE_FILE" \
    --output "$SMOKE_TEMP_DIR/session-cap-page.json" \
    --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    --header 'X-Inertia: true' \
    "$SMOKE_ORIGIN/sessions"
)"
[[ "$SMOKE_CAP_PAGE_STATUS" == "200" ]] || \
  fail 'The newest session could not read the bounded session view.'
node -e "
  const page = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))
  const sessions = page.props?.sessions
  const limit = Number(process.argv[2])
  if (!Array.isArray(sessions) || sessions.length !== limit) process.exit(1)
  if (sessions.filter((session) => session?.isCurrent === true).length !== 1) process.exit(1)
  for (let index = 1; index < sessions.length; index += 1) {
    if (Date.parse(sessions[index - 1].createdAt) < Date.parse(sessions[index].createdAt)) {
      process.exit(1)
    }
  }
" "$SMOKE_TEMP_DIR/session-cap-page.json" "$SMOKE_SESSION_LIMIT" || \
  fail 'The session view was not complete, bounded, current-aware, and newest-first.'

SMOKE_CAP_OLDEST_REPLAY_STATUS="$(
  curl --max-time 10 --silent --show-error \
    --cookie "$SMOKE_CAP_OLDEST_COOKIE_FILE" \
    --dump-header "$SMOKE_TEMP_DIR/session-cap-oldest-replay.headers" \
    --output "$SMOKE_TEMP_DIR/session-cap-oldest-replay.html" \
    --write-out '%{http_code}' \
    --header 'Accept: text/html' \
    "$SMOKE_ORIGIN/sessions"
)"
assert_redirect_to_login \
  "$SMOKE_CAP_OLDEST_REPLAY_STATUS" \
  "$SMOKE_TEMP_DIR/session-cap-oldest-replay.headers" \
  'A replay of the session evicted by the per-user cap'

printf 'Worker smoke test passed: startup, auth/body precedence, ownership concealment, monotonic optimistic updates and deletes, retired-ID non-resurrection, immediate public-route privacy, D1 replay, Inertia conflict handling, closed auth endpoints, atomic credential limits, bounded session creation, session revocation, authoritative logout, opaque passwords, and JSON API.\n'
