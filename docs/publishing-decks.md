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
   `<base href="/decks/<slug>/">`** as the first `<head>` child → verifies over HTTP at the
   real subpath (clean URL 200, base present, `support.js`/`deck-stage.js`/CSS/font/image
   all 200) → runs a **facts guard** that refuses to publish a bundle containing any
   known-wrong fact (e.g. `4 golden`, the pre-US-55 API, `never touches Notion`). It fails
   loudly if any check fails. The facts guard mirrors `tests/docs/test_deck_facts.py` in
   `hermes-control-plane` (which guards the Marp side); keep the two lists in sync.

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

## Source-of-truth split

- **Facts / structure / narrative** live in the Marp skeleton in `hermes-control-plane`
  (`docs/deck/pm-intelligence-system.md`) — change facts there first.
- **Wording / visuals / motion** live in the Claude Design project.
- This published bundle is the **render**, not a source to hand-edit (except the `<base>`
  the script manages).
