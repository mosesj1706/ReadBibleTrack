#!/usr/bin/env bash
#
# A release build for a phone.
#
# Release rather than debug because the JavaScript is embedded: the app runs
# with this machine asleep, on any network, which a debug build cannot do —
# it fetches its JavaScript from Metro on every launch.
#
# The backend has to be the hosted project, not the LAN one. Expo lets
# `.env.local` beat exported variables, so that file is moved aside for the
# build. It is restored the moment the build finishes rather than when this
# script exits, because `expo run:ios` stays attached streaming device logs
# long afterwards — leaving development pointed at nothing in the meantime.
set -euo pipefail
cd "$(dirname "$0")/.."

# CocoaPods needs a UTF-8 locale or its `unicode_normalize` throws on a path.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

DEVICE="${1:-00008120-001C50322E43A01E}"
LOG="$(mktemp -t readbibletrack-release)"

moved=0
if [ -f .env.local ]; then mv .env.local .env.local.aside; moved=1; fi
restore() {
  if [ "$moved" = 1 ] && [ -f .env.local.aside ]; then
    mv -f .env.local.aside .env.local
    moved=0
  fi
}
trap restore EXIT INT TERM

set -a; . ./.env.production.local; set +a
case "${EXPO_PUBLIC_SUPABASE_URL:-}" in
  https://*.supabase.co) echo "backend: $EXPO_PUBLIC_SUPABASE_URL" ;;
  *)
    echo "REFUSING: backend is '${EXPO_PUBLIC_SUPABASE_URL:-unset}', not the hosted project."
    echo "A phone taken out of the house cannot reach a LAN address."
    exit 1
    ;;
esac

npx expo run:ios --device "$DEVICE" --configuration Release 2>&1 | tee "$LOG" &
build=$!

# Give the environment back as soon as the app exists, not when the log stream
# eventually ends.
( while kill -0 "$build" 2>/dev/null; do
    if grep -q "Build Succeeded" "$LOG" 2>/dev/null; then break; fi
    sleep 3
  done
  sleep 5
  if [ -f .env.local.aside ]; then mv -f .env.local.aside .env.local; fi
) &

wait "$build" || true
restore
echo "done — .env.local is back at $(grep -m1 EXPO_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)"
