# Notion Polish Tuning Matrix

## Scope
- Profile: `balanced` (default)
- Rollback profile: `legacy` via `NEXT_PUBLIC_NOTION_POLISH_PROFILE=legacy`
- Global coverage: all notion-rendered pages (`pages/[pageId].tsx`)

## Style Layer Contract
- `styles/notion-parity.css`
  - Goal: notion.site parity-critical defaults (layout/spacing/header structure)
  - Rule scope: `.notion-polish-balanced`
- `styles/notion-feature.css`
  - Goal: functionality-preserving rules (gallery preview/modal, mermaid, header property portal)
  - Rule scope: profile-agnostic unless behavior needs balancing
- `styles/notion-brand.css`
  - Goal: minimal brand accents that do not break parity
  - Rule scope: `.notion-polish-balanced`
- `styles/notion-legacy.css`
  - Goal: fast rollback for key pre-polish look choices
  - Rule scope: `.notion-polish-legacy`

## Screenshot Delta (notion.site ref vs react-notion-x render)
- Delta A: top hero/content rhythm
  - Current: cover-to-title and icon-to-title rhythm feels slightly looser than notion.site
  - Target: tighten first fold rhythm so title appears one visual beat earlier
- Delta B: reading column geometry
  - Current: paragraph + side quote composition appears slightly narrow/rigid
  - Target: match notion.site text-measure and side-by-side breathing room
- Delta C: inline DB visual density
  - Current: table header/body rhythm, column header emphasis, and cell padding differ from notion.site
  - Target: adjust table density to match notion defaults while preserving readability
- Delta D: typography weight/contrast balance
  - Current: heading/body/quote contrast not fully aligned with notion.site
  - Target: harmonize H1/H2/body/quote scale and weight ladder

## Execution Plan
1. Baseline lock (day 0)
   - Freeze reference shots for 4 canonical pages: profile, table-heavy, gallery-heavy, mixed-content.
   - Save current vs target capture pairs at desktop `1440x2000`, mobile `390x2000`.
   - Output: visual baseline artifacts and per-page delta notes.
2. Geometry pass (P0)
   - File: `styles/notion-parity.css`
   - Tune tokens first: `--np-page-max-width`, `--np-cover-height`, `--np-hero-overlap`, `--np-hero-gap-after`, `--np-title-size`.
   - Focus selectors:
     - `.notion-page-has-cover`
     - `.notion-page-icon-hero`
     - `.notion-page .notion-title`
   - Acceptance: first fold (cover/icon/title/first paragraph start) is visually aligned within a small perceptual delta.
3. Typography/rhythm pass (P0)
   - File: `styles/notion-parity.css`
   - Normalize scale ladder:
     - body/list/table font-size tokens
     - `line-height` rhythm for paragraph/list/quote
     - heading weight/size for H1/H2/H3 and collection title
   - Acceptance: heading prominence and body legibility match notion.site without increasing layout jump.
4. Inline DB parity pass (P1)
   - Files: `styles/notion-parity.css`, `styles/notion-feature.css` (only if behavioral CSS is required)
   - Adjust:
     - table header/body padding
     - header text emphasis
     - row rhythm and left alignment
   - Acceptance: inline DB header and rows visually track notion.site while retaining current wrapping behavior.
5. Brand scope minimization (P1)
   - File: `styles/notion-brand.css`
   - Reduce brand accents that bias away from notion.site in default reading flow (especially link/highlight behaviors).
   - Keep brand layer opt-in feel; parity layer remains source of truth.
   - Acceptance: brand styles no longer dominate base notion look.
6. Final verification + rollout (P0)
   - Run visual regression and interaction checks.
   - If any parity regression is found, hot rollback to `legacy` profile remains available.

## Page Type Matrix
- Profile page (cover + icon + long text)
  - Keep: custom nav/breadcrumb and chat widget
  - Parity-first: title scale, cover/icon rhythm, first content offset
- Table-heavy inline DB page
  - Keep: functional table readability (wrapping where needed)
  - Parity-first: header/body density, column emphasis, edge alignment
- Gallery-heavy page
  - Keep: `data-gallery-preview="1"` modal/preview behavior
  - Parity-first: gallery cards remain neutral unless explicitly preview-enabled
- Mixed content page (callout/code/quote)
  - Keep: code/mermaid functionality
  - Parity-first: quote/callout spacing and text rhythm

## QA Checklist
- Visual regression
  - Desktop: `1440x2000`
  - Mobile: `390x2000`
  - Capture at least 4 pages (include root)
- Compare on each shot
  - Cover width/height/radius
  - Page icon size and anchor position
  - Title size/weight/line-height
  - First paragraph start position
  - Quote/callout/code rhythm
  - Inline DB table alignment/padding
- Interaction checks
  - Gallery modal open/close/zoom
  - Header search and nav links
  - Link hover/focus visibility
- Non-regression checks
  - Dark mode toggle
  - Side peek rendering
  - Admin pages unaffected by notion global CSS

## Commands
- Run visual capture
  - `pnpm qa:notion-polish`
  - Optional: `pnpm qa:notion-polish -- --base-url http://localhost:3001 --pages "/,/pageA,/pageB,/pageC"`
