#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# scripts/release-win.sh
#
# Automated Windows release pipeline for RestBro.
# Produces an unsigned NSIS installer (.exe) for Windows x64.
# Can be run from macOS (requires Wine) or from Windows/WSL.
#
# Flow: clean → build → package
#
# Usage:
#   npm run release:win
#   -- or --
#   bash scripts/release-win.sh
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
  local now
  now=$(date +%s)
  if (( STEP_START != PIPELINE_START )); then
    local elapsed=$(( now - STEP_START ))
    echo -e "  ${YELLOW}⏱  Step took $(format_duration $elapsed)${RESET}"
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

cd "$PROJECT_DIR"

VERSION=$(node -p "require('./package.json').version")

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  RestBro Windows Release Pipeline  v${VERSION}${RESET}"
echo -e "${BOLD}  Target: x64 NSIS installer (unsigned)${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"

# ─── Step 0: Validate environment ────────────────────────────────
step "[0/4] Validating environment..."

for cmd in node npm npx; do
  if ! command -v "$cmd" &>/dev/null; then
    die "Required command not found: $cmd"
  fi
done

# Check for Wine if on macOS/Linux (needed for NSIS)
if [[ "$(uname)" == "Darwin" || "$(uname)" == "Linux" ]]; then
  if ! command -v wine64 &>/dev/null && ! command -v wine &>/dev/null; then
    die "Wine is required to build Windows installers on macOS/Linux.
    Install with: brew install --cask wine-stable"
  fi
  ok "Wine found (needed for NSIS cross-compilation)"
fi

ok "Environment validated"

# ─── Step 1: Clean previous Windows artifacts ────────────────────
step "[1/4] Cleaning previous Windows artifacts..."

rm -f "$RELEASE_DIR"/*.exe "$RELEASE_DIR"/*.exe.blockmap "$RELEASE_DIR"/latest.yml 2>/dev/null || true
ok "Previous Windows artifacts cleaned"

# ─── Step 2: Build TypeScript + Webpack ───────────────────────────
step "[2/4] Building application..."

npm run build
ok "Build complete"

# ─── Step 3: Package with electron-builder ────────────────────────
step "[3/4] Packaging Windows installer..."

CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win
ok "Windows installer packaged"

# ─── Step 4: Verify artifacts ─────────────────────────────────────
step "[4/4] Verifying artifacts..."

EXE=$(find "$RELEASE_DIR" -maxdepth 1 -name "*.exe" | head -1)
if [[ -z "$EXE" ]]; then
  die "No .exe found in $RELEASE_DIR"
fi

EXE_SIZE=$(du -h "$EXE" | cut -f1)
ok "Installer: $(basename "$EXE") ($EXE_SIZE)"

YML="$RELEASE_DIR/latest.yml"
if [[ -f "$YML" ]]; then
  ok "Auto-updater manifest: latest.yml"
fi

# ─── Summary ──────────────────────────────────────────────────────
TOTAL_ELAPSED=$(( $(date +%s) - PIPELINE_START ))

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✅ Windows build complete!  ($(format_duration $TOTAL_ELAPSED))${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  Installer: $(basename "$EXE")"
echo "  Size:      $EXE_SIZE"
echo ""
echo "  Next step: publish to GitHub"
echo "    bash scripts/publish-github-release.sh"
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
