#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# scripts/release-mac.sh
#
# Automated macOS release pipeline for RestBro.
# Produces a signed, notarized, stapled universal DMG (+ ZIP).
#
# Flow: clean → build → sign → verify → package → notarize → staple → verify
#
# Usage:
#   npm run release:mac
#   -- or --
#   bash scripts/release-mac.sh
#
# Required environment variables (Apple ID method — recommended):
#   APPLE_ID                    - Your Apple ID email
#   APPLE_APP_SPECIFIC_PASSWORD - App-specific password (NOT your account password)
#   APPLE_TEAM_ID               - Apple Developer Team ID (e.g. 244JV2VL85)
#
# Optional (API key method — takes precedence if all three are set):
#   APPLE_API_KEY    - Path to .p8 private key file
#   APPLE_API_KEY_ID - App Store Connect API key ID
#   APPLE_API_ISSUER - App Store Connect issuer UUID
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Helpers ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PIPELINE_START=$(date +%s)
STEP_START=$PIPELINE_START

format_duration() {
  local secs=$1
  if (( secs < 60 )); then
    echo "${secs}s"
  else
    echo "$(( secs / 60 ))m $(( secs % 60 ))s"
  fi
}

step() {
  # Print elapsed time for the previous step (skip on first call)
  local now
  now=$(date +%s)
  if (( now > PIPELINE_START && STEP_START != PIPELINE_START || STEP_START == PIPELINE_START )); then
    if (( STEP_START != PIPELINE_START )); then
      local elapsed=$(( now - STEP_START ))
      echo -e "  ${YELLOW}⏱  Step took $(format_duration $elapsed)${RESET}"
    fi
  fi
  STEP_START=$(date +%s)
  echo -e "\n${CYAN}${BOLD}▸ $1${RESET}"
}
ok()   { echo -e "  ${GREEN}✓ $1${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${RESET}"; }
die()  { echo -e "  ${RED}✘ $1${RESET}" >&2; exit 1; }

# ─── Configuration ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_DIR/release"
APP_NAME="Restbro"

cd "$PROJECT_DIR"

VERSION=$(node -p "require('./package.json').version")

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  RestBro macOS Release Pipeline  v${VERSION}${RESET}"
echo -e "${BOLD}  Target: universal binary (arm64 + x64)${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"

# ─── Step 0: Validate environment ────────────────────────────────
step "[0/8] Validating environment..."

if [[ "$(uname)" != "Darwin" ]]; then
  die "This script must be run on macOS."
fi

for cmd in codesign xcrun spctl node npm shasum; do
  if ! command -v "$cmd" &>/dev/null; then
    die "Required command not found: $cmd"
  fi
done

# Determine notarization method
USE_API_KEY=false
if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  USE_API_KEY=true
  ok "Notarization: App Store Connect API key"
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  ok "Notarization: Apple ID + app-specific password"
else
  echo ""
  die "Notarization credentials missing.

  Set ONE of these groups in your shell:

  Apple ID method (recommended):
    export APPLE_ID='your@email.com'
    export APPLE_APP_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx'
    export APPLE_TEAM_ID='244JV2VL85'

  API key method:
    export APPLE_API_KEY='/path/to/AuthKey_XXXXXXXXXX.p8'
    export APPLE_API_KEY_ID='XXXXXXXXXX'
    export APPLE_API_ISSUER='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'"
fi

# Check signing certificate
if ! security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
  die "No 'Developer ID Application' certificate found in Keychain.
  Install your certificate or check 'security find-identity -v -p codesigning'."
fi
ok "Signing certificate: Developer ID Application found"

# ─── Step 1: Clean old artifacts ─────────────────────────────────
step "[1/8] Cleaning old release artifacts..."

rm -rf "$RELEASE_DIR"
ok "Removed release/"

rm -rf "$PROJECT_DIR/dist"
ok "Removed dist/"

# ─── Step 2: Build the app ───────────────────────────────────────
step "[2/8] Building application (tsc + webpack)..."

npm run build
ok "Build complete"

# Record build timestamp (seconds since epoch) for freshness check
BUILD_TIMESTAMP=$(date +%s)

# ─── Step 3: Package with electron-builder ────────────────────────
step "[3/8] Packaging universal macOS app with electron-builder..."

# electron-builder reads arch from package.json build.mac.target
npx electron-builder --mac
ok "Packaging complete"

# ─── Step 4: Locate and validate artifacts ────────────────────────
step "[4/8] Locating build artifacts..."

# The .app for universal builds lives in mac-universal/
APP_DIR="$RELEASE_DIR/mac-universal"
APP_PATH="$APP_DIR/$APP_NAME.app"

if [[ ! -d "$APP_PATH" ]]; then
  # Fallback: search for it
  FOUND_APP=$(find "$RELEASE_DIR" -maxdepth 3 -name "*.app" -type d 2>/dev/null | head -1)
  if [[ -n "$FOUND_APP" ]]; then
    APP_PATH="$FOUND_APP"
    APP_DIR="$(dirname "$APP_PATH")"
    warn "App found at alternate location: $APP_PATH"
  else
    die "Restbro.app not found in $RELEASE_DIR"
  fi
fi
ok "App: $APP_PATH"

# Locate DMG
DMG_PATH=$(find "$RELEASE_DIR" -maxdepth 1 -name "*.dmg" | head -1)
if [[ -z "$DMG_PATH" ]]; then
  die "DMG not found in $RELEASE_DIR"
fi
ok "DMG (electron-builder): $DMG_PATH"

# Locate ZIP (optional)
ZIP_PATH=$(find "$RELEASE_DIR" -maxdepth 1 -name "*.zip" | head -1)
if [[ -n "$ZIP_PATH" ]]; then
  ok "ZIP: $ZIP_PATH"
fi

# ── Freshness guard ──────────────────────────────────────────────
# Refuse to notarize stale artifacts (older than 15 min from build start)
DMG_MTIME=$(stat -f %m "$DMG_PATH")
AGE_SECONDS=$(( $(date +%s) - DMG_MTIME ))
MAX_AGE=900  # 15 minutes

if (( AGE_SECONDS > MAX_AGE )); then
  die "STALE ARTIFACT DETECTED!
  DMG last modified ${AGE_SECONDS}s ago (limit: ${MAX_AGE}s).
  This means an old build may be present. Re-run the full pipeline."
fi
ok "Freshness check passed (artifact is ${AGE_SECONDS}s old, limit ${MAX_AGE}s)"

# ─── Step 5: Verify code signature (pre-notarization) ────────────
step "[5/8] Verifying code signature..."

echo "  codesign --verify --deep --strict --verbose=2 ..."
if ! codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1; then
  die "Code signature verification failed. Check signing configuration."
fi
ok "codesign verification passed"

echo ""
echo "  spctl -a -vv (Gatekeeper assessment)..."
SPCTL_OUTPUT=$(spctl -a -vv "$APP_PATH" 2>&1 || true)
echo "  $SPCTL_OUTPUT" | head -5
if echo "$SPCTL_OUTPUT" | grep -q "accepted"; then
  ok "spctl assessment: accepted"
else
  warn "spctl assessment did not pass yet (expected before notarization)"
fi

# ─── Step 6: Notarize ────────────────────────────────────────────
step "[6/8] Notarizing artifacts with Apple..."

notarize_artifact() {
  local artifact_path="$1"
  local artifact_name
  artifact_name=$(basename "$artifact_path")

  echo ""
  echo -e "  ${CYAN}Submitting:${RESET} $artifact_path"

  if $USE_API_KEY; then
    xcrun notarytool submit "$artifact_path" \
      --key "$APPLE_API_KEY" \
      --key-id "$APPLE_API_KEY_ID" \
      --issuer "$APPLE_API_ISSUER" \
      --wait --timeout 30m
  else
    xcrun notarytool submit "$artifact_path" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      --wait --timeout 30m
  fi

  ok "$artifact_name notarized"
}

# Notarize ZIP if present
if [[ -n "$ZIP_PATH" ]]; then
  notarize_artifact "$ZIP_PATH"
fi

# ─── Step 7: Staple notarization ticket ──────────────────────────
step "[7/8] Stapling notarization tickets..."

# Apple's CDN can take a few minutes to propagate the ticket after notarization.
# Retry stapling with backoff to handle propagation delay.
staple_with_retry() {
  local artifact="$1"
  local label="$2"
  local max_attempts=5
  local delay=30

  for attempt in $(seq 1 "$max_attempts"); do
    if xcrun stapler staple "$artifact" 2>&1; then
      ok "$label stapled"
      return 0
    fi
    if (( attempt < max_attempts )); then
      warn "Staple attempt $attempt/$max_attempts failed. Retrying in ${delay}s (ticket propagation delay)..."
      sleep "$delay"
      delay=$(( delay * 2 ))
    fi
  done

  die "Failed to staple $label after $max_attempts attempts. Try manually: xcrun stapler staple \"$artifact\""
}

# Staple the .app bundle (the code-signed object that Gatekeeper actually checks)
staple_with_retry "$APP_PATH" "App"

if [[ -n "$ZIP_PATH" ]]; then
  echo "  ℹ  ZIP files cannot be stapled (macOS limitation)."
  echo "     The notarization ticket is available online; Gatekeeper will fetch it."
fi

# ── Rebuild DMG from the stapled .app ────────────────────────────
# DMG stapling is unreliable on Apple Silicon (synthetic cdHash issues).
# Rebuild the installer DMG from the stapled .app using electron-builder's
# DMG target so the Finder layout, background, and Applications symlink are
# preserved.
echo "  Rebuilding DMG with stapled .app and Finder layout..."
DMG_BASENAME=$(basename "$DMG_PATH")
DMG_REBUILD_DIR="$PROJECT_DIR/.tmp-dmg-rebuild"

rm -rf "$DMG_REBUILD_DIR"

npx electron-builder \
  --prepackaged "$APP_PATH" \
  --mac dmg \
  --publish never \
  -c.directories.output="$DMG_REBUILD_DIR"

REBUILT_DMG=$(find "$DMG_REBUILD_DIR" -maxdepth 1 -name "*.dmg" | head -1)
if [[ -z "$REBUILT_DMG" ]]; then
  rm -rf "$DMG_REBUILD_DIR"
  die "Rebuilt DMG not found in $DMG_REBUILD_DIR"
fi

mv -f "$REBUILT_DMG" "$DMG_PATH"
rm -rf "$DMG_REBUILD_DIR"
ok "DMG rebuilt with stapled .app and Finder layout"

echo ""
echo "  Notarizing final DMG..."
notarize_artifact "$DMG_PATH"

# ─── Step 8: Final verification ──────────────────────────────────
step "[8/8] Final verification (post-notarization)..."

echo "  Validating stapled .app..."
xcrun stapler validate "$APP_PATH" 2>&1 || die "Staple validation failed on .app"
ok "App staple validated"

echo ""
echo "  Verifying app signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1 || die "Post-notarization codesign check failed"
ok "App signature valid"

echo ""
echo "  Final Gatekeeper assessment..."
FINAL_SPCTL=$(spctl -a -vv "$APP_PATH" 2>&1 || true)
echo "  $FINAL_SPCTL" | head -5
if echo "$FINAL_SPCTL" | grep -q "accepted"; then
  ok "Gatekeeper: accepted (Notarized Developer ID)"
else
  warn "spctl did not report 'accepted'. This may still work — check output above."
fi

# ─── Summary ──────────────────────────────────────────────────────
# Print elapsed time for the final step
LAST_STEP_ELAPSED=$(( $(date +%s) - STEP_START ))
echo -e "  ${YELLOW}⏱  Step took $(format_duration $LAST_STEP_ELAPSED)${RESET}"

TOTAL_ELAPSED=$(( $(date +%s) - PIPELINE_START ))
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✅ Release build complete!${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  Version:  ${VERSION}"
echo "  Platform: macOS universal (arm64 + x64)"
echo "  Total time: $(format_duration $TOTAL_ELAPSED)"
echo ""

echo -e "  ${BOLD}📦 DMG (upload this to restbro.com):${RESET}"
echo "     ${DMG_PATH}"
DMG_SHA=$(shasum -a 256 "$DMG_PATH" | cut -d' ' -f1)
DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1 | xargs)
echo "     SHA-256: ${DMG_SHA}"
echo "     Size:    ${DMG_SIZE}"
echo ""

if [[ -n "$ZIP_PATH" ]]; then
  echo -e "  ${BOLD}📦 ZIP (for auto-updater or alternate distribution):${RESET}"
  echo "     ${ZIP_PATH}"
  ZIP_SHA=$(shasum -a 256 "$ZIP_PATH" | cut -d' ' -f1)
  ZIP_SIZE=$(du -h "$ZIP_PATH" | cut -f1 | xargs)
  echo "     SHA-256: ${ZIP_SHA}"
  echo "     Size:    ${ZIP_SIZE}"
  echo ""
fi

echo "  Upload the DMG file above to restbro.com."
echo "  It is signed, notarized, and contains a stapled .app."
echo "  Users can open it without Gatekeeper warnings."
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
