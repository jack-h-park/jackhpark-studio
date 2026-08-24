#!/usr/bin/env bash
#
# publish-deck.sh — publish a frontend-slides deck to the site's public/decks/<slug>/.
#
# frontend-slides decks are single, self-contained HTML files: all CSS/JS inline,
# fonts loaded from Google Fonts via absolute https:// URLs — no relative asset
# paths, no separate bundle directory, no runtime that needs configuring at
# publish time. This replaces the Claude Design-era version of this script,
# which existed almost entirely to fix problems specific to that runtime
# (a missing <base href> broke every relative asset; deck-stage.js needed a
# `no-rail` attribute injected post-export to hide its default thumbnail rail).
# Neither problem exists here, so this script is deliberately much shorter —
# see docs/publishing-decks.md for what changed and why.
#
# Usage:
#   scripts/publish-deck.sh <src.html> [slug]
#     <src.html>  a frontend-slides-generated HTML file (single, self-contained —
#                 e.g. hermes-control-plane's docs/deck/frontend-slides/core.html)
#     slug        deck folder under public/decks/ (default: derived from the
#                 source filename — core.html -> pm-intelligence-system,
#                 backup.html -> pm-intelligence-system-backup, anything else ->
#                 its own basename)
#
# After a clean run: `git add public/decks/<slug>` -> commit -> PR -> Vercel
# deploys to /decks/<slug>/.
#
set -euo pipefail

SRC="${1:?usage: publish-deck.sh <src.html> [slug]}"
[ -f "$SRC" ] || { echo "error: '$SRC' is not a file" >&2; exit 1; }

case "$(basename "$SRC")" in
  core.html)   DEFAULT_SLUG="pm-intelligence-system" ;;
  backup.html) DEFAULT_SLUG="pm-intelligence-system-backup" ;;
  *)           DEFAULT_SLUG="$(basename "$SRC" .html)" ;;
esac
SLUG="${2:-$DEFAULT_SLUG}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC="$ROOT/public"
DST="$PUBLIC/decks/$SLUG"
BASE="/decks/$SLUG/"
PORT="${DECK_VERIFY_PORT:-8971}"

log() { printf '  %s\n' "$*"; }

# ---- 1. place the file -----------------------------------------------------
echo "publish: $SRC -> $DST/index.html"
mkdir -p "$DST"
cp -f "$SRC" "$DST/index.html"

# A single-file deck should carry no relative-asset markers left over from a
# copy/paste of the old bundle-based flow. Catch that early and loudly rather
# than publishing something that will 404 in the browser.
if grep -q 'src="\./' "$DST/index.html" || grep -q 'href="\./' "$DST/index.html"; then
  echo "error: $DST/index.html references relative document paths (./...) —" >&2
  echo "       frontend-slides output should be fully self-contained. Publishing stopped." >&2
  exit 1
fi

# ---- 2. verify over HTTP at the subpath ------------------------------------
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

body="$(curl -s "http://localhost:$PORT$BASE")"
if [ -n "$body" ]; then log "200  ${BASE}  (clean URL serves index.html)"; else log "FAIL  ${BASE} served nothing"; fail=1; fi
if [[ "$body" == *"deck-stage"* ]] || [[ "$body" == *"deck-viewport"* ]]; then
  log "ok   frontend-slides stage markup present"
else
  log "FAIL frontend-slides stage markup (.deck-stage / .deck-viewport) missing — is this really a frontend-slides deck?"; fail=1
fi

kill "$SRV" 2>/dev/null || true; trap - EXIT

# ---- 3. facts guard — refuse to publish a known-wrong fact -----------------
# The published HTML is the LAST gate before the open web, and it is a page the
# control-plane's Python test (tests/docs/test_deck_facts.py) cannot see. Both
# now read the SAME file — hermes-control-plane docs/deck/deck-facts.json — so
# the list is written once. It used to be hand-copied into a FORBIDDEN[] array
# here, and on 2026-08-22 the two copies were found out of step in the worst
# way: this one still banned "4 golden" and its comment asserted the answer was
# 7, while the source of truth has always held four scenarios. A correct
# bundle would have been refused.
#
# There is deliberately NO fallback list. If the facts file cannot be found,
# publishing stops — a guard that silently degrades to "no known-wrong facts"
# is worse than none.
if [ -n "${DECK_FACTS:-}" ]; then
  FACTS_FILE="$DECK_FACTS"
elif [ -f "$(dirname "$SRC")/deck-facts.json" ]; then
  FACTS_FILE="$(dirname "$SRC")/deck-facts.json"       # shipped beside the source file
else
  FACTS_FILE="$ROOT/../../ai-assets/jackhpark-hermes-control-plane/docs/deck/deck-facts.json"
fi
if [ ! -f "$FACTS_FILE" ]; then
  echo ""
  echo "❌ facts guard: cannot find deck-facts.json (looked at '$FACTS_FILE')."
  echo "   Ship it next to the source file, or set DECK_FACTS=/path/to/deck-facts.json."
  echo "   It lives in jackhpark-hermes-control-plane at docs/deck/deck-facts.json."
  exit 1
fi
log "facts guard: $FACTS_FILE"

# Deliberately does NOT enforce `present` here. deck-facts.json's own scoping
# (see its "_note") is: present is required only in the *source-of-truth*
# deck — the Marp skeleton in hermes-control-plane, already checked by that
# repo's `docs-check` before anyone generates HTML from it. No frontend-slides
# output is ever that source-of-truth file; core.html and backup.html are
# each a PARTIAL render (one track apiece), so neither is expected to carry
# every fact — core.html has no reason to mention the cron count or the
# metered spend figure, both backup-only facts. Requiring `present` here
# blocked a real, correct publish of core.html the first time this rewrite
# was tested. What DOES apply to every published page: `absent` (a
# known-wrong string is wrong wherever it turns up) and `count` where the
# claim actually appears (if this page doesn't make the claim, it can't be
# publishing a wrong number — but if it does, that number must be right).
if python3 - "$DST/index.html" "$FACTS_FILE" <<'FACTSPY'
import html as htmllib
import json
import re
import sys

page = open(sys.argv[1], encoding="utf-8").read()
spec = json.load(open(sys.argv[2], encoding="utf-8"))

# Check the raw HTML *and* a tag-stripped rendering of it. Neither alone is enough:
# stripping joins text that a <strong> split in two ("**4 regression fixtures**"),
# while the raw source is the only place attribute content lives.
text = htmllib.unescape(re.sub(r"<[^>]+>", "", page))
haystacks = (page, text)

fails = []
checked = 0
for fact in spec["facts"]:
    label = fact["label"]
    for token in fact["absent"]:
        checked += 1
        if any(token in h for h in haystacks):
            fails.append("known-wrong '%s' [%s]\n         %s"
                         % (token, label, fact["source"]))
    cfg = fact.get("count")
    if cfg:
        checked += 1
        found = [int(m.group(1)) for m in re.finditer(cfg["deck_pattern"], text)]
        # No match = this page doesn't make the claim at all — fine for a
        # partial-track render. Only a WRONG match fails.
        for value in found:
            if value != cfg["value"]:
                fails.append("bundle says %d, source says %d [%s]\n         %s"
                             % (value, cfg["value"], label, fact["source"]))

for f in fails:
    print("  FAIL %s" % f)
if fails:
    print("  counted facts are cached in deck-facts.json — run `make deck-facts-verify`")
    print("  in hermes-control-plane to recount them from engine/observatory source.")
    sys.exit(1)
print("  ok   facts guard — %d checks from %s" % (checked, sys.argv[2].split("/")[-1]))
FACTSPY
then :; else fail=1; fi

slides="$(grep -c '<section class="slide' "$DST/index.html" || true)"
echo ""
if [ "$fail" = 0 ]; then
  echo "✅ published '$SLUG' (${slides} slides) -> $DST"
  echo "   next: git add public/decks/$SLUG  ->  commit + PR  ->  Vercel deploys to $BASE"
  echo "   ⚠  still EYEBALL the render in a browser before/after merge — curl 200 is not enough."
else
  echo "❌ verification failed — do NOT publish. Fix the errors above."
  exit 1
fi
