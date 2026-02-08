#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Automate manual ingestion from the Admin dashboard with Playwright CLI.

Usage:
  scripts/playwright/admin-ingestion-workflow.sh [options]

Options:
  --base-url URL                App base URL (default: http://localhost:3000)
  --mode MODE                   ingestion mode: url|notion (default: url)
  --target-url URL              URL to ingest (required when --mode url)
  --notion-page-ids IDS         Notion page ID(s), comma/space/newline delimited
  --notion-scope SCOPE          selected|workspace (default: selected)
  --include-linked-pages BOOL   true|false (default: true)
  --update-strategy STRATEGY    partial|full (default: partial)
  --embedding-match TEXT        Optional substring of embedding option label
  --wait-timeout-sec N          Max wait for completion (default: 900)
  --session NAME                Playwright CLI session name
  --artifact-dir PATH           Artifact output dir
  --headed                      Run browser headed
  --help                        Show this help
EOF
}

if ! command -v npx >/dev/null 2>&1; then
  cat <<'EOF'
npx is required but not found. Install Node.js/npm first:

# Verify Node/npm are installed
node --version
npm --version

# If missing, install Node.js/npm, then:
npm install -g @playwright/cli@latest
playwright-cli --help
EOF
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
INGEST_MODE="${INGEST_MODE:-url}"
TARGET_URL="${TARGET_URL:-}"
NOTION_PAGE_IDS="${NOTION_PAGE_IDS:-}"
NOTION_SCOPE="${NOTION_SCOPE:-selected}"
INCLUDE_LINKED_PAGES="${INCLUDE_LINKED_PAGES:-true}"
UPDATE_STRATEGY="${UPDATE_STRATEGY:-partial}"
EMBEDDING_MATCH="${EMBEDDING_MATCH:-}"
WAIT_TIMEOUT_SEC="${WAIT_TIMEOUT_SEC:-900}"
HEADED=0

RUN_STAMP="$(date +%Y%m%d-%H%M%S)"
SESSION="${PLAYWRIGHT_CLI_SESSION:-admin-ingestion-$RUN_STAMP}"
ARTIFACT_DIR="${ARTIFACT_DIR:-output/playwright/admin-ingestion-$RUN_STAMP}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --mode)
      INGEST_MODE="$2"
      shift 2
      ;;
    --target-url)
      TARGET_URL="$2"
      shift 2
      ;;
    --notion-page-ids)
      NOTION_PAGE_IDS="$2"
      shift 2
      ;;
    --notion-scope)
      NOTION_SCOPE="$2"
      shift 2
      ;;
    --include-linked-pages)
      INCLUDE_LINKED_PAGES="$2"
      shift 2
      ;;
    --update-strategy)
      UPDATE_STRATEGY="$2"
      shift 2
      ;;
    --embedding-match)
      EMBEDDING_MATCH="$2"
      shift 2
      ;;
    --wait-timeout-sec)
      WAIT_TIMEOUT_SEC="$2"
      shift 2
      ;;
    --session)
      SESSION="$2"
      shift 2
      ;;
    --artifact-dir)
      ARTIFACT_DIR="$2"
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

if [[ "$INGEST_MODE" != "url" && "$INGEST_MODE" != "notion" ]]; then
  echo "--mode must be one of: url, notion" >&2
  exit 1
fi

if [[ "$NOTION_SCOPE" != "selected" && "$NOTION_SCOPE" != "workspace" ]]; then
  echo "--notion-scope must be one of: selected, workspace" >&2
  exit 1
fi

if [[ "$UPDATE_STRATEGY" != "partial" && "$UPDATE_STRATEGY" != "full" ]]; then
  echo "--update-strategy must be one of: partial, full" >&2
  exit 1
fi

if [[ "$INCLUDE_LINKED_PAGES" != "true" && "$INCLUDE_LINKED_PAGES" != "false" ]]; then
  echo "--include-linked-pages must be true or false" >&2
  exit 1
fi

if [[ "$INGEST_MODE" == "url" && -z "$TARGET_URL" ]]; then
  echo "--target-url is required when --mode url" >&2
  exit 1
fi

if [[ "$INGEST_MODE" == "notion" && "$NOTION_SCOPE" == "selected" && -z "$NOTION_PAGE_IDS" ]]; then
  echo "--notion-page-ids is required when --mode notion and --notion-scope selected" >&2
  exit 1
fi

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
echo "Mode: $INGEST_MODE"
echo "Base URL: $BASE_URL"

cleanup() {
  pw close >/dev/null 2>&1 || true
}
trap cleanup EXIT

pushd "$ARTIFACT_DIR_ABS" >/dev/null

if [[ "$HEADED" -eq 1 ]]; then
  pw open "$BASE_URL/admin/ingestion" --headed
else
  pw open "$BASE_URL/admin/ingestion"
fi

pw snapshot > "01-ingestion-snapshot.txt" || true

INGEST_MODE="$INGEST_MODE" \
TARGET_URL="$TARGET_URL" \
NOTION_PAGE_IDS="$NOTION_PAGE_IDS" \
NOTION_SCOPE="$NOTION_SCOPE" \
INCLUDE_LINKED_PAGES="$INCLUDE_LINKED_PAGES" \
UPDATE_STRATEGY="$UPDATE_STRATEGY" \
EMBEDDING_MATCH="$EMBEDDING_MATCH" \
WAIT_TIMEOUT_SEC="$WAIT_TIMEOUT_SEC" \
pw run-code '
const mode = process.env.INGEST_MODE ?? "url";
const targetUrl = process.env.TARGET_URL ?? "";
const notionPageIds = process.env.NOTION_PAGE_IDS ?? "";
const notionScope = process.env.NOTION_SCOPE ?? "selected";
const includeLinkedPages = (process.env.INCLUDE_LINKED_PAGES ?? "true") === "true";
const strategy = process.env.UPDATE_STRATEGY ?? "partial";
const embeddingMatch = process.env.EMBEDDING_MATCH ?? "";
const timeoutMs = Number(process.env.WAIT_TIMEOUT_SEC ?? "900") * 1000;

const manualCard = page.locator("section.ai-card").filter({
  has: page.getByRole("heading", { name: "Manual Ingestion" }),
});
await manualCard.first().waitFor({ state: "visible", timeout: 45000 });

if (mode === "url") {
  await page.getByRole("button", { name: "URL", exact: true }).click();
  await page.getByLabel("URL to ingest", { exact: true }).fill(targetUrl);
} else {
  await page.getByRole("button", { name: "Notion", exact: true }).click();
  if (notionScope === "workspace") {
    await page.getByText("Ingest all pages in this workspace", { exact: false }).first().click();
  } else {
    await page.getByText("Ingest only selected page(s)", { exact: false }).first().click();
    await page.getByLabel("Select page(s) to ingest", { exact: true }).fill(notionPageIds);
    const linkedPages = page.getByRole("checkbox", { name: "Include linked pages", exact: true });
    const checked = await linkedPages.isChecked();
    if (checked !== includeLinkedPages) {
      await linkedPages.click();
    }
  }
}

if (strategy === "full") {
  await page.getByText("Re-ingest all pages", { exact: false }).first().click();
} else {
  await page.getByText("Only pages with changes", { exact: false }).first().click();
}

if (embeddingMatch.trim().length > 0) {
  await page.getByLabel("Embedding model", { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(embeddingMatch, "i") }).first().click();
}

const runButton = page.getByRole("button", { name: "Run manually", exact: true });
await runButton.waitFor({ state: "visible", timeout: 15000 });
await runButton.click();

await page.getByRole("button", { name: "Running", exact: true }).waitFor({
  state: "visible",
  timeout: 30000,
});

await page.waitForFunction(() => {
  const cards = Array.from(document.querySelectorAll("section.ai-card"));
  const manual = cards.find((card) => card.textContent?.includes("Manual Ingestion"));
  if (!manual) return false;
  const text = manual.textContent ?? "";
  const terminal = /(Succeeded|Completed with Errors|Failed)/.test(text);
  const active = /In Progress/.test(text);
  return terminal && !active;
}, { timeout: timeoutMs });
'

pw screenshot > "02-ingestion-finished.txt" || true

pw eval '
(() => {
  const cards = Array.from(document.querySelectorAll("section.ai-card"));
  const manual = cards.find((card) => card.textContent?.includes("Manual Ingestion"));
  if (!manual) {
    return JSON.stringify({ error: "Manual Ingestion card not found." });
  }

  const normalized = (manual.textContent ?? "").replace(/\s+/g, " ").trim();
  const statusMatch = normalized.match(/\b(Idle|In Progress|Succeeded|Completed with Errors|Failed)\b/);
  const runIdMatch = normalized.match(/Run ID:\s*([a-zA-Z0-9-]+)/);
  const processedMatch = normalized.match(/Documents Processed\s*([0-9,]+)/);
  return JSON.stringify({
    status: statusMatch ? statusMatch[1] : null,
    runId: runIdMatch ? runIdMatch[1] : null,
    documentsProcessed: processedMatch ? processedMatch[1].replaceAll(",", "") : null,
  }, null, 2);
})()
' > "run-result.json"

if [[ "$INGEST_MODE" == "url" ]]; then
  TARGET_URL="$TARGET_URL" \
  pw run-code '
  const targetUrl = process.env.TARGET_URL ?? "";
  const hostname = (() => {
    try {
      return new URL(targetUrl).hostname;
    } catch {
      return "";
    }
  })();
  if (hostname) {
    await page.goto(new URL("/admin/documents", location.origin).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");
    await page.getByText(hostname, { exact: false }).first().waitFor({
      state: "visible",
      timeout: 30000,
    });
  }
  '
  pw screenshot > "03-documents-verify.txt" || true
fi

popd >/dev/null

echo "Automation complete."
echo "Artifacts written to: $ARTIFACT_DIR_ABS"
echo "Summary file: $ARTIFACT_DIR_ABS/run-result.json"
