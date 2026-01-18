# UI Primitives Naming & Placement Policy

## Naming rules for `components/ui`
- All files in `components/ui` must use **kebab-case** (e.g., `segmented-control.tsx` + `segmented-control.module.css`).  
- CSS module files should mirror their corresponding TS/TSX file names (`foo.tsx` → `foo.module.css`).  
- Exported component names may remain `PascalCase`; only the file path changes.  
- This keeps IDE import auto-completion predictable and avoids mixing naming conventions in a single folder.

## Placement rules
- **`components/ui` is for primitives only** (cards, buttons, panels, inputs, utilities). These assets must not contain domain-specific copy, strings, or workflows.  
- **Domain components live inside feature folders** (e.g., `components/admin/ingestion`, `components/chat/settings`). If a component references only ingestion concepts (e.g., `RecentRunsFilters`), move it under the ingestion feature folder while keeping its API intact.  
- Example: `RecentRunsFilters` was moved from `components/ui/recent-runs-filters.tsx` to `components/admin/ingestion/recent-runs-filters.tsx` to emphasize ingest-only usage while preserving the component name.

## Verification commands
Run these before merging to catch naming/placement regressions:

1. `rg -n "components/ui/.*[A-Z]" components/ui -S` – detects any PascalCase files left inside `components/ui`.  
2. `rg -n "components/ui/recent-runs-filters" -S` – ensures the ingestion-only component is no longer under `components/ui`.  
3. `rg -n "ImpactTooltip" components -S` / `rg -n "from\\s+['\"].*ImpactTooltip" components -S` – verifies imports point to the renamed `impact-tooltip.tsx`.  
4. `rg -n "Tabs\\.module\\.css" components -S` / `rg -n "from\\s+['\"].*Tabs\\.module\\.css['\"]" components -S` – keeps references to `tabs.module.css` consistent when renaming UI primitives in the future.

