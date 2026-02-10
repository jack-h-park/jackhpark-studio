#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Capture notion polish visual regression screenshots with Playwright CLI.

Usage:
  scripts/playwright/notion-polish-visual-regression.sh [options]

Options:
  --base-url URL      App base URL (default: http://localhost:3000)
  --pages CSV         Comma-delimited paths (default: project presets)
  --artifact-dir DIR  Artifact output directory
  --session NAME      Playwright session name
  --headed            Run browser headed
  --help              Show this help

Examples:
  pnpm qa:notion-polish
  pnpm qa:notion-polish -- --base-url http://localhost:3001 --pages "/,/abc123,/def456,/ghi789"
HELP
}

if ! command -v npx >/dev/null 2>&1; then
  cat <<'HELP'
npx is required but not found. Install Node.js/npm first:

# Verify Node/npm are installed
node --version
npm --version

# If missing, install Node.js/npm, then:
npm install -g @playwright/cli@latest
playwright-cli --help
HELP
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
DEFAULT_PAGES="/,/28299029c0b481ce8999d425287d3db6,/28299029c0b4816e89c0c4f17a39963b,/28299029c0b481ce8999d425287d3db6?lite=1"
PAGES_CSV="${NOTION_POLISH_PAGES:-$DEFAULT_PAGES}"
HEADED=0

RUN_STAMP="$(date +%Y%m%d-%H%M%S)"
# Keep session/artifact names short to avoid Unix socket path length issues on macOS.
SESSION="${PLAYWRIGHT_CLI_SESSION:-np-$RUN_STAMP}"
ARTIFACT_DIR="${ARTIFACT_DIR:-output/playwright/np-$RUN_STAMP}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --pages)
      PAGES_CSV="$2"
      shift 2
      ;;
    --artifact-dir)
      ARTIFACT_DIR="$2"
      shift 2
      ;;
    --session)
      SESSION="$2"
      shift 2
      ;;
    --headed)
      HEADED=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="${PWCLI:-$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh}"
if [[ ! -f "$PWCLI" ]]; then
  echo "Playwright wrapper not found at: $PWCLI" >&2
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"
ARTIFACT_DIR_ABS="$(cd "$ARTIFACT_DIR" && pwd)"

pw() {
  "$PWCLI" --session "$SESSION" "$@"
}

echo "Session: $SESSION"
echo "Artifacts: $ARTIFACT_DIR_ABS"
echo "Base URL: $BASE_URL"
echo "Pages: $PAGES_CSV"

cleanup() {
  pw close >/dev/null 2>&1 || true
}
trap cleanup EXIT

PAGES=()
while IFS= read -r page; do
  PAGES+=("$page")
done < <(printf '%s\n' "$PAGES_CSV" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sed '/^$/d')

if [[ "${#PAGES[@]}" -lt 1 ]]; then
  echo "No pages configured for notion polish QA." >&2
  exit 1
fi

slugify() {
  local value="$1"
  local slug
  slug="$(printf '%s' "$value" | sed -E 's#https?://##g; s/[^a-zA-Z0-9]+/-/g; s/^-+|-+$//g')"
  if [[ -z "$slug" ]]; then
    slug="root"
  fi
  printf '%s' "$slug"
}

capture_viewport() {
  local name="$1"
  local width="$2"
  local height="$3"

  local cfg
  cfg="$(mktemp "${TMPDIR:-/tmp}/notion-polish-${name}-XXXXXX.json")"
  cat >"$cfg" <<JSON
{
  "browser": {
    "contextOptions": {
      "viewport": { "width": ${width}, "height": ${height} }
    }
  }
}
JSON

  local session_name="${SESSION}-${name}"
  pwc() {
    "$PWCLI" --config "$cfg" --session "$session_name" "$@"
  }

  if [[ "$HEADED" -eq 1 ]]; then
    pwc open "$BASE_URL" --headed >/dev/null
  else
    pwc open "$BASE_URL" >/dev/null
  fi

  for page_path in "${PAGES[@]}"; do
    local absolute
    if [[ "$page_path" =~ ^https?:// ]]; then
      absolute="$page_path"
    else
      absolute="${BASE_URL%/}${page_path}"
    fi

    pwc goto "$absolute" >/dev/null
    pwc run-code "page.waitForTimeout(1200)" >/dev/null

    local shot_out
    local src_rel=""
    local attempt
    for attempt in 1 2 3; do
      shot_out="$(pwc screenshot || true)"
      src_rel="$(printf '%s\n' "$shot_out" | rg -o '\.playwright-cli/[^ )]+\.png' -m1 || true)"
      if [[ -n "$src_rel" && -f "$src_rel" ]]; then
        break
      fi
      pwc run-code "page.waitForTimeout(600)" >/dev/null || true
    done
    if [[ -z "$src_rel" || ! -f "$src_rel" ]]; then
      echo "Failed to resolve screenshot source: $page_path ($name)" >&2
      echo "$shot_out" >&2
      rm -f "$cfg"
      return 1
    fi

    cp "$src_rel" "$ARTIFACT_DIR_ABS/${name}-$(slugify "$page_path").png"
  done

  pwc close >/dev/null || true
  rm -f "$cfg"
}

capture_viewport desktop 1440 2000
capture_viewport mobile 390 2000

echo "Saved screenshots to: $ARTIFACT_DIR_ABS"
