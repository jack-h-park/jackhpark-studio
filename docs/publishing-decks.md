# Publishing Claude Design decks to the site

Interactive decks authored in **Claude Design** are published as self-contained static
bundles under `public/decks/<slug>/`, served at `https://jackhpark.com/decks/<slug>/`.

`scripts/publish-deck.sh` automates the **deterministic** publish steps — the manual,
forgettable part that once broke production (fonts fell back and text overlapped because
the `<base href>` was missing). It does **not** talk to Claude Design; the export is a
separate, authenticated step.

## Flow

1. **Export the bundle from Claude Design** (authenticated — not scriptable):
   - from a Claude Code session via the **DesignSync** tool (`get_file` the `*.dc.html`;
     the `_ds/`, fonts, `deck-stage.js`, `support.js`, `images/` only change when you
     re-generate them), **or**
   - from Claude Design's own export.
   Land it in a local directory (full bundle) or as a single updated `*.dc.html`.

2. **Run the publish script:**
   ```bash
   # full bundle (first publish, or assets changed):
   scripts/publish-deck.sh /path/to/exported-bundle pm-intelligence-system

   # entry-only update (you only edited slide content → only the .dc.html changed):
   scripts/publish-deck.sh /path/to/"PM Intelligence System.dc.html" pm-intelligence-system
   ```
   The script: places the bundle → renames `*.dc.html` → `index.html` → **injects
   `<base href="/decks/<slug>/">`** as the first `<head>` child → **injects the `no-rail`
   chrome setter** (see below) → verifies over HTTP at the real subpath (clean URL 200, base
   present, no-rail setter present, `support.js`/`deck-stage.js`/CSS/font/image all 200) →
   runs a **facts guard** that refuses to publish a bundle whose facts have drifted. It
   fails loudly if any check fails.

   The facts guard reads **`hermes-control-plane` `docs/deck/deck-facts.json`** — the same
   file `tests/docs/test_deck_facts.py` and `make deck-facts-verify` read over there. There
   is no list in this repo any more: it used to be a hand-copied `FORBIDDEN[]` array, and on
   2026-08-22 the two copies were found out of step in the worst way — this one still banned
   `4 golden` while the source of truth has always held four scenarios, so a *corrected*
   bundle would have been refused.

   The script finds the file at `$DECK_FACTS`, then next to the bundle, then in the sibling
   `hermes-control-plane` checkout. **If it finds none, publishing stops** — there is no
   fallback list, because a guard that quietly degrades to "no known-wrong facts" is worse
   than none. Ship `deck-facts.json` alongside the export, or set `DECK_FACTS`.

   Three kinds of check per fact: banned strings must be absent, corrected values must be
   present, and countable figures (endpoints, Observatory sections, integrity rules, eval
   fixtures) must match the count cached in the file. Run `make deck-facts-verify` in
   `hermes-control-plane` first — that recounts them from the engine and observatory source.

3. **Commit + PR:**
   ```bash
   git add public/decks/pm-intelligence-system
   git commit -m "chore(decks): republish pm-intelligence-system"
   # open a PR; Vercel builds a preview, then deploys to /decks/<slug>/ on merge.
   ```

4. **Eyeball the render** in a browser (preview or prod) — fonts + no text overlap.
   `curl 200` is necessary but **not sufficient**; the failure that bit us only shows in a
   real browser at the subpath.

## Why `<base href>` is mandatory

The deck loads every asset with **document-relative** paths (`./support.js`,
`_ds/…/styles.css`, fonts, images). Served at `/decks/<slug>/`, if the trailing slash is
dropped the browser base becomes `/decks/` and every asset 404s. The `<base href>` pins
resolution to the deploy path regardless of trailing slash. It is **not** in the Claude
Design export, so the script re-adds it on every publish.

## Why the `no-rail` chrome setter

The deck runtime (`deck-stage.js`) shows a ~188px **thumbnail navigator rail** down the left
edge by default. For a finished portfolio/presentation deck we want **full-bleed slides**, so
the script sets the runtime's `no-rail` attribute. Navigation is unaffected — the hover control
bar (`‹ n/40 › Reset`) and keyboard (←/→) still work, and the rail auto-hides on mobile anyway.

Mechanics: `no-rail` lives on the runtime `<deck-stage>` element, which the runtime generates
from `<x-import>` at load time — and **attributes do not forward through `<x-import>`** (verified;
only `width`/`height` do). It is also **not** in the Claude Design export. So the script injects a
tiny script (marker `deck-chrome:no-rail`) that sets the attribute once `<deck-stage>` exists —
the same "publish-time transform, not in the export" rationale as `<base href>`. To bring the rail
back, delete that injection step.

## Source-of-truth split

- **Facts / structure / narrative** live in the Marp skeleton in `hermes-control-plane`
  (`docs/deck/pm-intelligence-system.md`) — change facts there first.
- **Wording / visuals / motion** live in the Claude Design project.
- This published bundle is the **render**, not a source to hand-edit (except the `<base>`
  the script manages).
