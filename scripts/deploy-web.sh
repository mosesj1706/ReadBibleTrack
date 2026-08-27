#!/usr/bin/env bash
#
# Build the web app and put it behind CloudFront.
#
#   ./scripts/deploy-web.sh <bucket> <distribution-id>
#
# The stack in infra/web-hosting.yaml has to exist first; its outputs give you
# both arguments. Create it once with:
#
#   aws cloudformation deploy \
#     --template-file infra/web-hosting.yaml \
#     --stack-name readbibletrack-web \
#     --parameter-overrides BucketName=<globally-unique-name>
#
set -euo pipefail

BUCKET="${1:?usage: deploy-web.sh <bucket> <distribution-id>}"
DISTRIBUTION="${2:?usage: deploy-web.sh <bucket> <distribution-id>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- the deploy uses production credentials, not the dev ones --------------
#
# .env.local points at the local stack so development cannot write to the real
# database. The hosted values live separately and are exported here, explicitly,
# rather than relying on which env file a tool decides to load.
ENV_FILE="$ROOT/.env.production.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ No .env.production.local."
  echo "  It holds the hosted Supabase URL and publishable key. Without it the"
  echo "  build would be made against whatever development is pointing at."
  exit 1
fi
set -a; . "$ENV_FILE"; set +a

# EXPO_PUBLIC_* values are baked into the bundle at build time. Shipping one
# built against this machine gives every visitor a sign-in screen that reaches
# nothing, with only a console error to explain it.
case "${EXPO_PUBLIC_SUPABASE_URL:-}" in
  ""|*localhost*|*127.0.0.1*|*192.168.*|*10.*)
    echo "✗ EXPO_PUBLIC_SUPABASE_URL is '${EXPO_PUBLIC_SUPABASE_URL:-unset}'."
    echo "  That is this machine, not a server."
    exit 1
    ;;
esac
case "${EXPO_PUBLIC_SUPABASE_KEY:-}" in
  ""|*service_role*|sb_secret_*)
    echo "✗ EXPO_PUBLIC_SUPABASE_KEY is missing, or is a secret key."
    echo "  Only the publishable key belongs in a client bundle."
    exit 1
    ;;
esac
echo "  · backend: $EXPO_PUBLIC_SUPABASE_URL"

echo "  · building"
cd "$ROOT"
rm -rf dist

# Expo loads .env.local itself and it wins over exported shell variables, so
# simply exporting the production values is not enough — the build comes out
# pointing at whatever development uses, while every check here passes. Move it
# out of the way for the build, and put it back whatever happens.
HIDDEN=""
if [ -f "$ROOT/.env.local" ]; then
  HIDDEN="$ROOT/.env.local.deploying"
  mv "$ROOT/.env.local" "$HIDDEN"
  trap 'if [ -n "$HIDDEN" ] && [ -f "$HIDDEN" ]; then mv "$HIDDEN" "$ROOT/.env.local"; fi' EXIT INT TERM
fi

# --clear is not optional. Expo inlines EXPO_PUBLIC_* at transform time and
# Metro caches the transformed module, so a changed backend URL does not
# invalidate anything — the build silently keeps whatever it saw first.
LANG=en_US.UTF-8 npx expo export --platform web --clear >/dev/null

if [ -n "$HIDDEN" ] && [ -f "$HIDDEN" ]; then
  mv "$HIDDEN" "$ROOT/.env.local"
  HIDDEN=""
fi

# Prove it rather than trust it: the bundle must carry the hosted host and no
# trace of a local one.
BUNDLE="$(find dist/_expo/static/js/web -name 'entry-*.js' | head -1)"
HOST="$(printf '%s' "$EXPO_PUBLIC_SUPABASE_URL" | sed -e 's|https\{0,1\}://||' -e 's|/.*||')"
if ! grep -q "$HOST" "$BUNDLE"; then
  echo "✗ The build does not contain $HOST. Refusing to upload it."
  exit 1
fi
if grep -qE "127\.0\.0\.1:54321|localhost:54321" "$BUNDLE"; then
  echo "✗ The build still points at a local Supabase. Refusing to upload it."
  exit 1
fi
echo "  · verified: bundle targets $HOST"

# --- upload ----------------------------------------------------------------
#
# Two passes, because the caching rules are opposites. Everything under
# _expo/ and assets/ carries a content hash in its filename, so it can be
# cached for a year and never revalidated. The HTML has stable names and must
# not be, or a deploy would not reach anyone already carrying the old copy.

echo "  · uploading immutable assets"
aws s3 sync dist/ "s3://$BUCKET/" --delete \
  --exclude "*" --include "_expo/*" --include "assets/*" \
  --cache-control "public, max-age=31536000, immutable" \
  --only-show-errors

# S3 guesses most content types correctly but not these two, and a wasm file
# served as octet-stream fails to instantiate in some browsers.
echo "  · fixing content types"
aws s3 cp "s3://$BUCKET/assets/" "s3://$BUCKET/assets/" --recursive \
  --exclude "*" --include "*.wasm" \
  --content-type "application/wasm" \
  --cache-control "public, max-age=31536000, immutable" \
  --metadata-directive REPLACE --only-show-errors || true

echo "  · uploading pages"
aws s3 sync dist/ "s3://$BUCKET/" --delete \
  --exclude "_expo/*" --exclude "assets/*" \
  --cache-control "public, max-age=0, must-revalidate" \
  --only-show-errors

echo "  · invalidating the edge"
ID="$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION" --paths '/*' \
  --query 'Invalidation.Id' --output text)"

DOMAIN="$(aws cloudfront get-distribution --id "$DISTRIBUTION" \
  --query 'Distribution.DomainName' --output text)"

echo
echo "  ✓ https://$DOMAIN   (invalidation $ID, a minute or two to spread)"
