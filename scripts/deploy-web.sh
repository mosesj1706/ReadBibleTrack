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

# --- refuse to ship a build that points at this laptop ----------------------
#
# EXPO_PUBLIC_* values are baked into the bundle at build time. A deploy with
# the local Supabase URL produces a site where signing in silently fails for
# everyone, and the only clue is a network error in the console.
URL="$(grep -E '^EXPO_PUBLIC_SUPABASE_URL=' "$ROOT/.env.local" 2>/dev/null | cut -d= -f2- || true)"
case "$URL" in
  ""|*localhost*|*127.0.0.1*|*192.168.*|*10.*)
    echo "✗ EXPO_PUBLIC_SUPABASE_URL is '${URL:-unset}'."
    echo "  That is this machine, not a server. Point .env.local at the hosted"
    echo "  Supabase project before deploying, or every visitor gets a sign-in"
    echo "  screen that cannot reach anything."
    exit 1
    ;;
esac
echo "  · backend: $URL"

echo "  · building"
cd "$ROOT"
rm -rf dist
LANG=en_US.UTF-8 npx expo export --platform web >/dev/null

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
