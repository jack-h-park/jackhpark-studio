# Notion Wide-Viewport Layout Plan

**Date:** 2026-09-19
**Branch:** `claude/notion-full-width-layout-acfce6`
**Status:** Phases 1–2 done; Phases 3–5 open

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

### Phase 1 — breakout tokens and block selectors — DONE

Shipped as committed. Two things the plan did not anticipate:

- The collection-with-description wrapper carried an inline `width: 100%`, which
  beat the breakout rule. It is redundant for a block-level div and is now a class.
- A collection reaches the reading column in **two** DOM shapes. With a description
  it sits inside one wrapper; without one, react-notion-x returns a fragment, so the
  header div and `.notion-collection` land as separate siblings. The first pass only
  matched the wrapped shape, which is why `/personal-craft` did not widen at first.

Original scope:

- Add a wide token (`--np-wide-max-width`) to `styles/notion-parity.css`. It is screen-specific, so
  it must not go into `styles/ai-design-system.css` (primitive-only per
  [docs/css-guardrails.md](../../css-guardrails.md)).
- Break out, inside `.notion-page-content-inner`:
  - collection blocks (gallery / list / board)
  - column rows (`.notion-row`)
  - `.notion-asset-wrapper-full`
- Below 1200px nothing changes.
- Guardrail: `pnpm lint:css-guardrails`.

### Phase 2 — root page — DONE

The root page's reading column is 1040px above 1200px, matching the column-row
breakout, so the page title lines up with the hero row (16px apart, which is the
page's own padding). Measured alternatives at 1920px: 744px leaves a 164px offset,
900px leaves 86px, 1040px leaves 16px.

1040px costs nothing in readability here because the root page has **no** plain
text blocks in its reading column — the intro prose lives inside the hero row,
which Phase 1 already pinned at 1040px. Only images, the mermaid diagram and one
callout widen.

The documented `.index-page { --notion-max-width: 900px }` rules were never
reachable, since nothing applied the class. They are replaced rather than revived:
an unscoped 900px would also apply below the breakpoint and overflow narrow
screens. The width now lives only in the wide-viewport section of
`styles/notion-parity.css`.

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
