# Notion Polish Rollout Notes

## Why
Global notion overrides had drifted far from notion.site defaults, creating visible mismatch in title scale, table alignment, cover/icon treatment, and header surface styling.

## What changed
- Introduced profile switch via `NEXT_PUBLIC_NOTION_POLISH_PROFILE`:
  - `balanced` (default)
  - `legacy`
- Added body class from `components/NotionPage.tsx`:
  - `notion-polish-balanced` or `notion-polish-legacy`
- Replaced monolithic import with layered styles in `styles/global.css`:
  - parity -> feature -> brand -> legacy
- Moved gallery-specific inline CSS from `components/NotionPage.tsx` into `styles/notion-feature.css`

## Keep vs rollback
- Keep
  - Gallery preview behavior based on `data-gallery-preview="1"`
  - Custom navigation and breadcrumbs
  - Chat widget and side-peek feature paths
- Rollback to notion parity in balanced profile
  - Oversized title override
  - Table left-offset and forced padding tweaks
  - Heavy cover/icon radius-shadow customization
  - Frosted/blur header surface
  - Aggressive text-block spacing compression

## Rollback plan
- Immediate rollback path: set `NEXT_PUBLIC_NOTION_POLISH_PROFILE=legacy` and redeploy.
