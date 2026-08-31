#!/usr/bin/env bash
#
# Archive the app and send it to TestFlight.
#
#   ./scripts/upload-testflight.sh <issuer-id> <key-id>
#
# The key is an App Store Connect API key, and it has to be sitting at
# ~/.appstoreconnect/private_keys/AuthKey_<key-id>.p8 — that path is not a
# convention, it is where Apple's tools look. Apple lets you download the .p8
# exactly once; there is no second chance and no way to read it back.
#
# The app record must already exist in App Store Connect. An upload for a
# bundle identifier with no record is rejected after the whole upload has
# finished, which is a slow way to find out.
set -euo pipefail

ISSUER="${1:?usage: upload-testflight.sh <issuer-id> <key-id>}"
KEY="${2:?usage: upload-testflight.sh <issuer-id> <key-id>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# CocoaPods dies inside unicode_normalize without a UTF-8 locale.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

KEYFILE="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY}.p8"
if [ ! -f "$KEYFILE" ]; then
  echo "✗ No key at $KEYFILE"
  echo "  Apple's tools look there and nowhere else. Move the downloaded .p8"
  echo "  into place under exactly that name."
  exit 1
fi

# --- the build must point at the hosted project ----------------------------
#
# Same trap as the device build: Expo loads .env.local itself and it beats
# exported variables, so a TestFlight build made without moving it aside ships
# to testers pointing at a laptop on a home network.
set -a; . ./.env.production.local; set +a
case "${EXPO_PUBLIC_SUPABASE_URL:-}" in
  https://*.supabase.co) echo "  · backend: $EXPO_PUBLIC_SUPABASE_URL" ;;
  *)
    echo "✗ Backend is '${EXPO_PUBLIC_SUPABASE_URL:-unset}', not the hosted project."
    exit 1
    ;;
esac

HIDDEN=""
if [ -f .env.local ]; then
  HIDDEN="$ROOT/.env.local.uploading"
  mv .env.local "$HIDDEN"
  trap 'if [ -n "$HIDDEN" ] && [ -f "$HIDDEN" ]; then mv "$HIDDEN" "$ROOT/.env.local"; fi' EXIT INT TERM
fi

ARCHIVE="$ROOT/build/ReadBibleTrack.xcarchive"
EXPORT="$ROOT/build/export"
rm -rf "$ARCHIVE" "$EXPORT"

echo "  · archiving"
xcodebuild -workspace ios/ReadBibleTrack.xcworkspace -scheme ReadBibleTrack \
  -configuration Release -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" -allowProvisioningUpdates archive \
  -quiet

# Prove the bundle before it goes anywhere. A tester cannot tell a wrong
# backend from a broken app, and by then it is on their phone.
BUNDLE="$ARCHIVE/Products/Applications/ReadBibleTrack.app/main.jsbundle"
HOST="$(printf '%s' "$EXPO_PUBLIC_SUPABASE_URL" | sed -e 's|https\{0,1\}://||' -e 's|/.*||')"
if ! strings "$BUNDLE" | grep -q "$HOST"; then
  echo "✗ The archive does not contain $HOST. Refusing to upload it."
  exit 1
fi
if strings "$BUNDLE" | grep -qE "127\.0\.0\.1:54321|localhost:54321"; then
  echo "✗ The archive still points at a local Supabase. Refusing to upload it."
  exit 1
fi
echo "  · verified: archive targets $HOST"

cat > "$ROOT/build/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>3DZVS28VX3</string>
  <!-- Symbols, so a crash report names a function rather than an address. -->
  <key>uploadSymbols</key><true/>
  <key>signingStyle</key><string>automatic</string>
</dict>
</plist>
PLIST

echo "  · exporting"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$ROOT/build/ExportOptions.plist" \
  -exportPath "$EXPORT" -allowProvisioningUpdates -quiet

IPA="$(find "$EXPORT" -name '*.ipa' | head -1)"
[ -n "$IPA" ] || { echo "✗ No .ipa came out of the export."; exit 1; }

echo "  · uploading $(basename "$IPA")"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$KEY" --apiIssuer "$ISSUER"

echo
echo "  ✓ uploaded. Processing on Apple's side takes a few minutes; the build"
echo "    appears in TestFlight once it is done."
echo "    Bump ios.buildNumber in app.json before the next upload — Apple"
echo "    refuses a build number it has already seen."
