# Notion Wide-Viewport Layout Plan

**Date:** 2026-09-19
**Branch:** `claude/notion-full-width-layout-acfce6`
**Status:** Phase 1 in progress

## Problem

On a 1920px viewport the Notion body column is 744px — 39% of the screen. Measured on
`https://www.jackhpark.com/studio`:

| Item | Current | With `.notion-full-width` forced on |
|---|---|---|
| `main.notion-page` width | 744px | 1690px |
| Gallery grid | 2 columns (348px cards) | 6 columns (268px cards) |
| Body text line length | ~700px | 1037px (~180 characters — unreadable) |
| Hero page icon | correct | overlaps the site header |

Facts established while diagnosing:

- The constraint is `--np-page-max-width: 744px` in [styles/notion-parity.css](../../../styles/notion-parity.css).
- The root Notion page has `page_full_width: false`. react-notion-x already honors that flag
  (`.notion-full-width` on `main.notion-page`, `--notion-max-width: min(1920px, 98vw)`).
- `.notion-polish-balanced .index-page { --notion-max-width: 900px }` is dead CSS: nothing in the
  app adds an `index-page` class, so the root page renders at 744px like every other page.
- Nothing in upstream react-notion-x (58 commits, up to v8.0.8) touches full-width, page width,
  `--notion-max-width` or gallery sizing. The upstream sync is independent of this work.

## Approach: reading column stays narrow, wide-capable blocks break out

Keep prose at a readable measure (~744px) and let only the blocks that benefit from width —
collections, column rows, full-width assets — break out of the reading column up to
`clamp(744px, 88vw, 1280px)`. This gets the gallery to ~4 columns at 1920px without turning body
text into 180-character lines.

Rejected alternatives:

- **Turn on Notion's Full width toggle only** — no code, but keeps the long-line and hero-icon
  problems in the table above.
- **Raise the page max-width to ~1200px globally** — simplest, but the same readability regression
  applies to every prose page.

## Phases

### Phase 1 — breakout tokens and block selectors (CSS only)

- Add a wide token (`--np-wide-max-width`) to `styles/notion-parity.css`. It is screen-specific, so
  it must not go into `styles/ai-design-system.css` (primitive-only per
  [docs/css-guardrails.md](../../css-guardrails.md)).
- Break out, inside `.notion-page-content-inner`:
  - collection blocks (gallery / list / board)
  - column rows (`.notion-row`)
  - `.notion-asset-wrapper-full`
- Below 1200px nothing changes.
- Guardrail: `pnpm lint:css-guardrails`.

### Phase 2 — root page

- Wire the `index-page` class so the documented root-page width actually applies
  ([components/NotionPageRenderer.tsx](../../../components/NotionPageRenderer.tsx)).
- Allow the hero column row to break out on the root page.

### Phase 3 — make Notion's Full width toggle usable

- Cap the text measure for text blocks under `.notion-full-width`.
- Fix the hero icon position (rules near [styles/notion.css:1122](../../../styles/notion.css)).
- Outcome: per-page Full width becomes a real option in Notion, not a broken one.

### Phase 4 — verify interactions

- **Tables / boards:** the fork's `third-party/collection.tsx` hard-codes a 708px body width and
  computes left/right padding in JS. Check alignment against the widened container; only patch the
  fork (read the width from a CSS variable) if it actually misaligns.
- **Card teaser:** the fork's text-teaser cover at the new card widths.
- **Side peek and the gallery preview modal** at wide viewports.

### Phase 5 — verification

- `pnpm qa:notion-polish` at 1024 / 1440 / 1920 / 390px, light and dark.
- Check for layout shift (CLS) introduced by the breakout rules.

## Out of scope (tracked separately)

**Fork sync.** Fork `jack-h-park/react-notion-x` diverged 2026-05-25; upstream is 58 commits ahead
(v8.0.8).

- Cherry-pick now onto a `7.10.0-jp.13` tag: `66fdef2` (search fix), `c0120f8`
  (`tableOfContentsTitle`), `eb12073` (bookmark image CSS). Small, independent, no packaging change.
- Defer the v8 upgrade to its own project. Consumer-side risks to fix first: image URL double
  wrapping (notion-utils 7.7.1 mapper re-wraps v8's already-resolved `app.notion.com` URLs), LQIP
  preview keys no longer matching, `app.notion.com` missing from `next.config.js` `remotePatterns`,
  and `unoptimized` being spread onto `<img>` in `components/NotionImage.tsx`. A dry-run merge
  produced 7 conflicting files, all tractable; the fork's `noExternal: [/^notion-/]` must be ported
  to tsdown.
