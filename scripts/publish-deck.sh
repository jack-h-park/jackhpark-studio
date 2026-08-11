#!/usr/bin/env bash
#
# publish-deck.sh — publish a Claude Design deck bundle to the site's public/decks/<slug>/.
#
# Automates the DETERMINISTIC half of the deck publish flow — the manual, forgettable part
# that broke production once (fonts fell back + text overlapped because <base href> was missing):
#
#   1. place the exported bundle under public/decks/<slug>/
#   2. rename the "<name>.dc.html" entry to index.html  (clean URL)
#   3. inject  <base href="/decks/<slug>/">  as the first <head> child  ← MANDATORY, NOT in the export
#   4. verify over HTTP at the real subpath (not just curl 200 of one file)
#
# The Claude Design EXPORT itself (pulling the bundle to a local dir) is a separate, auth'd
# step — done via DesignSync (from a Claude Code session) or Claude Design's own export. This
# script only transforms + places an already-exported bundle. See docs/publishing-decks.md.
#
# Usage:
#   scripts/publish-deck.sh <src> [slug]
#     <src>   a bundle DIRECTORY  (full re-publish), or
#             a single .dc.html / .html FILE  (entry-only update — keep existing assets)
#     slug    deck folder under public/decks/  (default: pm-intelligence-system)
#
# After a clean run: `git add public/decks/<slug>` → commit → PR → Vercel deploys to /decks/<slug>/.
#
set -euo pipefail

SRC="${1:?usage: publish-deck.sh <src-dir-or-.dc.html> [slug]}"
SLUG="${2:-pm-intelligence-system}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC="$ROOT/public"
DST="$PUBLIC/decks/$SLUG"
BASE="/decks/$SLUG/"
PORT="${DECK_VERIFY_PORT:-8971}"

log() { printf '  %s\n' "$*"; }

# ---- 1. place the bundle --------------------------------------------------
if [ -d "$SRC" ]; then
  ENTRY="$(find "$SRC" -maxdepth 1 \( -name '*.dc.html' -o -name 'index.html' \) | head -1)"
  [ -n "$ENTRY" ] || { echo "error: no *.dc.html / index.html in $SRC" >&2; exit 1; }
  echo "full re-publish: $SRC -> $DST"
  rm -rf "$DST"; mkdir -p "$DST"
  cp -R "$SRC"/. "$DST"/
  entry_name="$(basename "$ENTRY")"
  if [ "$entry_name" != "index.html" ]; then
    mv -f "$DST/$entry_name" "$DST/index.html"
    log "renamed '$entry_name' -> index.html"
  fi
elif [ -f "$SRC" ]; then
  [ -d "$DST" ] || { echo "error: entry-only update needs an existing $DST (do a full publish first)" >&2; exit 1; }
  echo "entry-only update: $SRC -> $DST/index.html"
  cp -f "$SRC" "$DST/index.html"
else
  echo "error: '$SRC' is neither a directory nor a file" >&2; exit 1
fi

# ---- 2. inject <base href> (idempotent) -----------------------------------
python3 - "$DST/index.html" "$BASE" <<'PY'
import re, sys
path, base = sys.argv[1], sys.argv[2]
html = open(path, encoding="utf-8").read()
tag = f'<base href="{base}">'
if re.search(r"<base\b", html):
    new = re.sub(r"<base\b[^>]*>", tag, html, count=1)
    print("  base present -> normalized href" if new != html else "  base already correct")
    html = new
else:
    html, n = re.subn(r"(<meta charset[^>]*>)", r"\1\n" + tag, html, count=1)
    if n == 0:
        html, n = re.subn(r"(<head[^>]*>)", r"\1\n" + tag, html, count=1)
    if n == 0:
        sys.exit("error: no <head> / <meta charset> to inject <base> after")
    print("  injected " + tag)
open(path, "w", encoding="utf-8").write(html)
PY

# ---- 3. verify over HTTP at the subpath -----------------------------------
echo "verify (serving public/ at :$PORT, checking $BASE):"
( cd "$PUBLIC" && exec python3 -m http.server "$PORT" >/dev/null 2>&1 ) &
SRV=$!
disown "$SRV" 2>/dev/null || true   # silence the job-control "Terminated" line on cleanup
trap 'kill "$SRV" 2>/dev/null || true' EXIT
# wait until the (single-threaded) server accepts connections
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 1
done
fail=0

# fetch the entry ONCE and reuse it (a double-fetch races the single-threaded server)
body="$(curl -s "http://localhost:$PORT$BASE")"
if [ -n "$body" ]; then log "200  ${BASE}  (clean URL serves index.html)"; else log "FAIL  ${BASE} served nothing"; fail=1; fi
# bash substring match (no pipe → avoids grep -q closing the pipe early under pipefail)
if [[ "$body" == *"<base href=\"$BASE\""* ]]; then
  log "ok   <base href> present in served HTML"
else
  log "FAIL <base href=\"$BASE\"> missing from served HTML"; fail=1
fi

css="$(cd "$DST" && ls _ds/*/styles.css 2>/dev/null | head -1 || true)"
font="$(cd "$DST" && ls _ds/*/fonts/Geist-Regular.woff2 2>/dev/null | head -1 || true)"
img="$(cd "$DST" && ls images/*.png 2>/dev/null | head -1 || true)"
for r in support.js deck-stage.js "$css" "$font" "$img"; do
  [ -n "$r" ] || continue
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT$BASE$r")
  [ "$code" = 200 ] && log "200  $r" || { log "FAIL($code)  $r"; fail=1; }
done

kill "$SRV" 2>/dev/null || true; trap - EXIT

# ---- 4. facts guard — refuse to publish a known-wrong fact ----------------
# Mirror of hermes-control-plane tests/docs/test_deck_facts.py (which guards the Marp
# skeleton). These strings only appear when a fact has drifted; keep the two lists in
# sync. Update BOTH the system and here when a fact genuinely changes.
FORBIDDEN=(
  "4 golden"                    # eval golden-scenario count is 7 (R01-R07)
  "S2 + S7"                     # note depth stops at S2 (no S7)
  "current_stage"               # US-55: run state is lifecycle/position/outcome
  "/runs/{id}/direction"        # US-55: unified POST /runs/{id}/decision
  "/runs/{id}/routing-review"   #   "
  "/runs?status="               # US-55: no ?status= on runs
  "auto-@mention"               # avatar consult is opt-in, not auto-every-gate
  "never touches Notion"        # Wren publishes to the Notion posts DB
  "Sole Notion writer"          # Quill = portfolio; Wren also writes Notion
)
facts_ok=1
for bad in "${FORBIDDEN[@]}"; do
  if grep -Fq "$bad" "$DST/index.html"; then
    log "FAIL known-wrong fact present: '$bad'"; fail=1; facts_ok=0
  fi
done
[ "$facts_ok" = 1 ] && log "ok   no known-wrong facts (facts guard)"

slides="$(grep -c '<section' "$DST/index.html" || true)"
echo ""
if [ "$fail" = 0 ]; then
  echo "✅ published '$SLUG' (${slides} slides) -> $DST"
  echo "   next: git add public/decks/$SLUG  ->  commit + PR  ->  Vercel deploys to $BASE"
  echo "   ⚠  still EYEBALL the render in a browser (fonts + overlap) before/after merge — curl 200 is not enough."
else
  echo "❌ verification failed — do NOT publish. Fix the errors above."
  exit 1
fi
