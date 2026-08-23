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

# ---- 2b. inject the no-rail chrome setter (idempotent) ---------------------
# The deck runtime (deck-stage.js) shows a 188px thumbnail navigator rail by
# default. For a finished portfolio/presentation deck we want full-bleed slides
# — nav still works via the hover control bar (‹ n/40 › Reset) + keyboard + the
# rail auto-hides on mobile anyway. The `no-rail` attribute lives on the runtime
# <deck-stage> element, which the runtime generates from <x-import> at load time
# (attributes do NOT forward through x-import — verified), and it is NOT in the
# Claude Design export. So set it from a tiny injected script once the element
# exists — the same "publish-time transform" rationale as <base href>.
python3 - "$DST/index.html" <<'PY'
import sys
path = sys.argv[1]
html = open(path, encoding="utf-8").read()
MARK = "deck-chrome:no-rail"
if MARK in html:
    print("  no-rail setter already present")
else:
    snippet = (
        '<script>/* ' + MARK + ' */(function(){'
        'function a(){var el=document.querySelector("deck-stage");'
        'if(el){if(!el.hasAttribute("no-rail"))el.setAttribute("no-rail","");return true;}return false;}'
        'if(!a()){var mo=new MutationObserver(function(){if(a())mo.disconnect();});'
        'mo.observe(document.documentElement,{childList:true,subtree:true});'
        'if(window.customElements&&customElements.whenDefined)customElements.whenDefined("deck-stage").then(a);'
        'document.addEventListener("DOMContentLoaded",a);window.addEventListener("load",a);}})();</script>'
    )
    if "</body>" in html:
        html = html.replace("</body>", snippet + "\n</body>", 1)
    else:
        html = html + snippet
    open(path, "w", encoding="utf-8").write(html)
    print("  injected no-rail setter")
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
if [[ "$body" == *"deck-chrome:no-rail"* ]]; then
  log "ok   no-rail chrome setter present in served HTML"
else
  log "FAIL no-rail chrome setter missing from served HTML"; fail=1
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
# The published .dc.html is the LAST gate before the open web, and it is HTML that the
# control-plane's Python test (tests/docs/test_deck_facts.py) cannot see. Both now read
# the SAME file — hermes-control-plane docs/deck/deck-facts.json — so the list is
# written once. It used to be hand-copied into a FORBIDDEN[] array here, and on
# 2026-08-22 the two copies were found out of step in the worst way: this one still
# banned "4 golden" and its comment asserted the answer was 7, while the source of truth
# has always held four scenarios. A correct bundle would have been refused.
#
# There is deliberately NO fallback list. If the facts file cannot be found, publishing
# stops — a guard that silently degrades to "no known-wrong facts" is worse than none.
if [ -n "${DECK_FACTS:-}" ]; then
  FACTS_FILE="$DECK_FACTS"
elif [ -d "$SRC" ] && [ -f "$SRC/deck-facts.json" ]; then
  FACTS_FILE="$SRC/deck-facts.json"                    # shipped with the exported bundle
elif [ -f "$(dirname "$SRC")/deck-facts.json" ]; then
  FACTS_FILE="$(dirname "$SRC")/deck-facts.json"       # …or beside a single .dc.html
else
  FACTS_FILE="$ROOT/../../ai-assets/jackhpark-hermes-control-plane/docs/deck/deck-facts.json"
fi
if [ ! -f "$FACTS_FILE" ]; then
  echo ""
  echo "❌ facts guard: cannot find deck-facts.json (looked at '$FACTS_FILE')."
  echo "   Ship it next to the bundle, or set DECK_FACTS=/path/to/deck-facts.json."
  echo "   It lives in jackhpark-hermes-control-plane at docs/deck/deck-facts.json."
  exit 1
fi
log "facts guard: $FACTS_FILE"
# The facts file names the wrong values on purpose — it does not belong on the web.
rm -f "$DST/deck-facts.json"

if python3 - "$DST/index.html" "$FACTS_FILE" <<'FACTSPY'
import html as htmllib
import json
import re
import sys

page = open(sys.argv[1], encoding="utf-8").read()
spec = json.load(open(sys.argv[2], encoding="utf-8"))

# Check the raw HTML *and* a tag-stripped rendering of it. Neither alone is enough:
# stripping joins text that a <strong> split in two ("**4 regression fixtures**"),
# while the raw source is the only place attribute content lives — data-speaker-notes
# carries facts too, and that is where "7 golden" was still sitting in the last publish.
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
    for token in fact["present"]:
        checked += 1
        if not any(token in h for h in haystacks):
            fails.append("missing '%s' [%s] — the bundle predates this correction\n"
                         "         %s" % (token, label, fact["source"]))
    cfg = fact.get("count")
    if cfg:
        checked += 1
        found = [int(m.group(1)) for m in re.finditer(cfg["deck_pattern"], text)]
        if not found:
            fails.append("nothing matches %s [%s] — the claim is missing from the "
                         "bundle, or reworded past its pattern"
                         % (cfg["deck_pattern"], label))
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
