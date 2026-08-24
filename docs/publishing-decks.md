# Publishing frontend-slides decks to the site

Interactive decks are authored as **frontend-slides** — single, self-contained HTML files,
all CSS/JS inline, fonts loaded from Google Fonts via absolute `https://` URLs — and
published to `public/decks/<slug>/`, served at `https://jackhpark.com/decks/<slug>/`.

> **This replaced a Claude Design-based flow on 2026-08-23.** The source of truth for
> facts/structure/wording is now a single Marp skeleton
> (`hermes-control-plane` `docs/deck/pm-intelligence-system.md`) that generates the HTML
> directly — no separate design tool, no `<base href>`/`no-rail` injection, no asset
> bundle. See `docs/deck/interview-improvement-plan.md` § 12 in that repo for the full
> rationale (drift between the skeleton and the design-tool render kept recurring).

`scripts/publish-deck.sh` places the generated file, verifies it serves correctly at the
real subpath, and refuses to publish if any load-bearing fact has drifted.

## Flow

1. **Generate the HTML** in `hermes-control-plane` (a Claude Code session there, via the
   `frontend-slides` skill, from the Marp skeleton). Output lands at
   `docs/deck/frontend-slides/<track>.html` in that repo — `core.html` (the
   hook + core track) and `backup.html` (the reference track) today.

2. **Run the publish script:**
   ```bash
   scripts/publish-deck.sh /path/to/hermes-control-plane/docs/deck/frontend-slides/core.html
   # -> public/decks/pm-intelligence-system/  (default slug for core.html)

   scripts/publish-deck.sh /path/to/hermes-control-plane/docs/deck/frontend-slides/backup.html
   # -> public/decks/pm-intelligence-system-appendix/  (default slug for backup.html)

   # override the slug explicitly if needed:
   scripts/publish-deck.sh /path/to/some-other-track.html custom-slug
   ```
   The script: copies the file to `public/decks/<slug>/index.html` → verifies over HTTP at
   the real subpath (clean URL 200, frontend-slides stage markup present) → runs a
   **facts guard** that refuses to publish a page with a known-wrong fact. It fails loudly
   if any check fails.

   The facts guard reads **`hermes-control-plane` `docs/deck/deck-facts.json`** — the same
   file `tests/docs/test_deck_facts.py` and `make deck-facts-verify` read over there.
   There is no list in this repo: it used to be a hand-copied `FORBIDDEN[]` array, and on
   2026-08-22 the two copies were found out of step in the worst way — this one still
   banned `4 golden` while the source of truth has always held four scenarios, so a
   *corrected* bundle would have been refused.

   The script finds the file at `$DECK_FACTS`, then next to the source `.html`, then in the
   sibling `hermes-control-plane` checkout. **If it finds none, publishing stops** — there
   is no fallback list, because a guard that quietly degrades to "no known-wrong facts" is
   worse than none. Ship `deck-facts.json` alongside the source file, or set `DECK_FACTS`.

   Two kinds of check apply to a published page: **banned strings must be absent**, and
   **any countable figure the page actually states must match** the count cached in the
   file. A **third kind — required strings** — is deliberately *not* enforced here: that
   check only applies to the skeleton itself (already run by that repo's `docs-check`,
   before generation), because `core.html` and `backup.html` are each a partial render of
   one track — `core.html` has no reason to mention the cron count or the metered-spend
   figure, both backup-only facts, and requiring every fact in every partial deck is a
   false failure, not a real one. Run `make deck-facts-verify` in `hermes-control-plane`
   first if you want the cached counts themselves re-verified against source — that
   recounts them from the engine and observatory source.

3. **Commit + PR:**
   ```bash
   git add public/decks/pm-intelligence-system   # or whichever slug
   git commit -m "chore(decks): republish pm-intelligence-system"
   # open a PR; Vercel builds a preview, then deploys to /decks/<slug>/ on merge.
   ```

4. **Eyeball the render** in a browser (preview or prod) — fonts, layout, the entrance
   cascade, keyboard/click navigation. `curl 200` and the facts guard catch content drift,
   not visual regressions.

## Why this is simpler than the old script

The Claude Design era needed two publish-time transforms because the exported bundle
was missing things the *runtime* required: a `<base href>` (without it, every
document-relative asset path 404s the moment the trailing slash is dropped) and a
`no-rail` attribute on the `<deck-stage>` runtime element (its default 188px thumbnail
rail, set post-export since Claude Design's own `<x-import>` doesn't forward custom
attributes). Both existed only because of a runtime with document-relative assets and a
JS component that needed configuring after the fact.

frontend-slides output has neither problem: everything is inline or loaded from an
absolute CDN URL, and there is no separate runtime to configure — the deck's own inline
`<script>` handles stage scaling, navigation, and the entrance cascade on load. So this
script only places the file, verifies it serves, and checks facts.

## Source-of-truth split

- **Facts / structure / wording** live in the Marp skeleton in `hermes-control-plane`
  (`docs/deck/pm-intelligence-system.md`) — change facts there first, then regenerate.
- The generated HTML (`core.html`, `backup.html`) is a **build artifact**, git-tracked in
  that repo, never hand-edited — regenerate from the skeleton instead.
- This published page is the **render** of that build artifact — not a source to
  hand-edit at all.
