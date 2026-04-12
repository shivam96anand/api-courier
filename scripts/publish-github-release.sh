#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# scripts/publish-github-release.sh
#
# Creates a GitHub Release from the artifacts produced by release-mac.sh.
# Uploads the DMG, ZIP, and latest-mac.yml (for auto-updater).
#
# Prerequisites:
#   brew install gh
#   gh auth login
#
# Usage:
#   bash scripts/publish-github-release.sh           # uses version from package.json
#   bash scripts/publish-github-release.sh v1.2.3    # explicit tag
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}▸ $1${RESET}"; }
ok()   { echo -e "  ${GREEN}✓ $1${RESET}"; }
die()  { echo -e "  ${RED}✘ $1${RESET}" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_DIR/release"

cd "$PROJECT_DIR"

# ─── Validate ────────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  die "GitHub CLI (gh) not found. Install with: brew install gh"
fi

if ! gh auth status &>/dev/null 2>&1; then
  die "Not authenticated with GitHub CLI. Run: gh auth login"
fi

VERSION=$(node -p "require('./package.json').version")
TAG="${1:-v$VERSION}"

echo ""
echo -e "${BOLD}Publishing GitHub Release: ${TAG}${RESET}"

# ─── Collect artifacts ────────────────────────────────────────────
step "Collecting release artifacts..."

ASSETS=()

DMG=$(find "$RELEASE_DIR" -maxdepth 1 -name "*.dmg" | head -1)
if [[ -n "$DMG" ]]; then ASSETS+=("$DMG"); ok "DMG: $(basename "$DMG")"; fi

ZIP=$(find "$RELEASE_DIR" -maxdepth 1 -name "*.zip" | head -1)
if [[ -n "$ZIP" ]]; then ASSETS+=("$ZIP"); ok "ZIP: $(basename "$ZIP")"; fi

YML=$(find "$RELEASE_DIR" -maxdepth 1 -name "latest-mac.yml" | head -1)
if [[ -n "$YML" ]]; then ASSETS+=("$YML"); ok "YML: latest-mac.yml (auto-updater manifest)"; fi

BLOCKMAP=$(find "$RELEASE_DIR" -maxdepth 1 -name "*.blockmap" 2>/dev/null)
for bm in $BLOCKMAP; do
  ASSETS+=("$bm")
  ok "Blockmap: $(basename "$bm")"
done

if [[ ${#ASSETS[@]} -eq 0 ]]; then
  die "No release artifacts found in $RELEASE_DIR. Run 'npm run release:mac' first."
fi

# ─── Create tag if needed ────────────────────────────────────────
step "Ensuring git tag ${TAG}..."

if git rev-parse "$TAG" &>/dev/null 2>&1; then
  ok "Tag $TAG already exists"
else
  git tag "$TAG"
  git push origin "$TAG"
  ok "Created and pushed tag $TAG"
fi

# ─── Create GitHub Release ───────────────────────────────────────
step "Creating GitHub Release..."

ASSET_ARGS=()
for asset in "${ASSETS[@]}"; do
  ASSET_ARGS+=("$asset")
done

# Check if release already exists
if gh release view "$TAG" &>/dev/null 2>&1; then
  echo "  Release $TAG already exists. Uploading assets (overwriting)..."
  gh release upload "$TAG" "${ASSET_ARGS[@]}" --clobber
else
  gh release create "$TAG" \
    --title "RestBro $TAG" \
    --generate-notes \
    "${ASSET_ARGS[@]}"
fi

ok "GitHub Release published!"

# ─── Trigger website revalidation ─────────────────────────────────
step "Triggering website cache refresh..."

REVALIDATE_SECRET="${REVALIDATE_SECRET:-}"
SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://restbro.com}"

if [[ -n "$REVALIDATE_SECRET" ]]; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$SITE_URL/api/revalidate" \
    -H "Authorization: Bearer $REVALIDATE_SECRET" \
    -H "Content-Type: application/json")

  if [[ "$HTTP_STATUS" == "200" ]]; then
    ok "Website cache revalidated (restbro.com/download will show new version)"
  else
    echo "  ⚠ Revalidation returned HTTP $HTTP_STATUS (website will auto-refresh within 5 min)"
  fi
else
  echo "  ℹ  Set REVALIDATE_SECRET to auto-refresh restbro.com"
  echo "     The website will auto-refresh within 5 minutes via ISR."
fi

# ─── Summary ──────────────────────────────────────────────────────
RELEASE_URL=$(gh release view "$TAG" --json url -q '.url' 2>/dev/null || echo "")

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✅ Release published!${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  Tag:     $TAG"
echo "  Release: $RELEASE_URL"
echo ""
echo "  Your website (restbro.com/download) will show this"
echo "  release within 5 minutes, or immediately if REVALIDATE_SECRET is set."
echo ""
echo "  Users with RestBro installed will get an auto-update notification."
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
