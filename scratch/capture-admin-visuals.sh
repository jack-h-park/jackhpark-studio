#!/usr/bin/env bash
set -euo pipefail

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="${PWCLI:-$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh}"

SESSION="admin-qa"
DEST_DIR="${DEST_DIR:-output/admin-visuals}"

: "${ADMIN_SMOKE_USER:?Set ADMIN_SMOKE_USER before running the capture script}"
: "${ADMIN_SMOKE_PASSWORD:?Set ADMIN_SMOKE_PASSWORD before running the capture script}"

mkdir -p "$DEST_DIR"

pw() {
  "$PWCLI" --session "$SESSION" "$@"
}

AUTH_URL_INGESTION="http://${ADMIN_SMOKE_USER}:${ADMIN_SMOKE_PASSWORD}@localhost:3000/admin/ingestion"
AUTH_URL_CHAT_CONFIG="http://${ADMIN_SMOKE_USER}:${ADMIN_SMOKE_PASSWORD}@localhost:3000/admin/chat-config"

echo "Starting session..."
pw open "$AUTH_URL_INGESTION"

# Set viewport size to 1280x1000
pw run-code "await page.setViewportSize({ width: 1280, height: 1000 })"

echo "Capturing Ingestion Dashboard (Light Mode)..."
pw goto "$AUTH_URL_INGESTION"
pw run-code "await page.waitForTimeout(2000)"
shot_out=$(pw screenshot)
src_rel=$(printf '%s\n' "$shot_out" | grep -o '\.playwright-cli/[^ )]*\.png' | head -n1 || true)
if [[ -n "$src_rel" && -f "$src_rel" ]]; then
  cp "$src_rel" "$DEST_DIR/ingestion-light.png"
  echo "Copied Ingestion Light: $src_rel"
else
  echo "Failed to capture Ingestion Light"
fi

echo "Capturing Ingestion Dashboard (Dark Mode)..."
pw run-code "await page.evaluate(() => { document.documentElement.classList.add('dark'); document.body.classList.add('dark'); })"
pw run-code "await page.waitForTimeout(1000)"
shot_out=$(pw screenshot)
src_rel=$(printf '%s\n' "$shot_out" | grep -o '\.playwright-cli/[^ )]*\.png' | head -n1 || true)
if [[ -n "$src_rel" && -f "$src_rel" ]]; then
  cp "$src_rel" "$DEST_DIR/ingestion-dark.png"
  echo "Copied Ingestion Dark: $src_rel"
else
  echo "Failed to capture Ingestion Dark"
fi

echo "Capturing Chat Configuration (Light Mode)..."
pw goto "$AUTH_URL_CHAT_CONFIG"
pw run-code "await page.waitForTimeout(2000)"
shot_out=$(pw screenshot)
src_rel=$(printf '%s\n' "$shot_out" | grep -o '\.playwright-cli/[^ )]*\.png' | head -n1 || true)
if [[ -n "$src_rel" && -f "$src_rel" ]]; then
  cp "$src_rel" "$DEST_DIR/chat-config-light.png"
  echo "Copied Chat Config Light: $src_rel"
else
  echo "Failed to capture Chat Config Light"
fi

echo "Capturing Chat Configuration (Dark Mode)..."
pw run-code "await page.evaluate(() => { document.documentElement.classList.add('dark'); document.body.classList.add('dark'); })"
pw run-code "await page.waitForTimeout(1000)"
shot_out=$(pw screenshot)
src_rel=$(printf '%s\n' "$shot_out" | grep -o '\.playwright-cli/[^ )]*\.png' | head -n1 || true)
if [[ -n "$src_rel" && -f "$src_rel" ]]; then
  cp "$src_rel" "$DEST_DIR/chat-config-dark.png"
  echo "Copied Chat Config Dark: $src_rel"
else
  echo "Failed to capture Chat Config Dark"
fi

echo "Closing session..."
pw close

echo "All screenshots captured successfully!"
