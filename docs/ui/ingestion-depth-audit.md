# Ingestion Dashboard Depth Audit

## Executive Summary (Top 5 Issues)
1. **Source rail feels like its own card** (Severity: High) – `ManualIngestionPanel` nests the source tabs inside `ai-panel` while `manualStyles.tabRail` re-introduces a 1px border and tinted background (`components/admin/ingestion/ManualIngestionPanel.tsx:229-266`, `components/admin/ingestion/ManualIngestionPanel.module.css:1-9`). The resulting double-border, double-surface treatment elevates what should be an L3 inline control to a separate L2 card, making the tabs compete visually with the parent `ai-card`.
2. **Run log introduces competing seams** (Severity: Medium-High) – the `ai-panel` wrapper for the log already draws a full border, yet `manualStyles.runLogPanel` and `manualStyles.runLogBody` each add a `border-top` that slices the same surface twice (`components/admin/ingestion/ManualIngestionPanel.tsx:605-657`, `components/admin/ingestion/ManualIngestionPanel.module.css:195-213`). This reinforces “cardy” depth, creates redundant dividers, and blurs the single L2 container intent.
3. **Recent Runs table is double-bordered** (Severity: High) – the parent `div` adds `tableShell` borders/background while the `DataTable` renders the `ai-table` (which itself draws a card-like shadow/border) inside it (`components/admin/ingestion/RecentRunsSection.tsx:998-1067`, `components/admin/ingestion/RecentRunsPanel.module.css:38-43`, `styles/ai-design-system.css:990-1015`). Stack two L2 surfaces and the table no longer reads as one unified group.
4. **Dataset Snapshot “Trend” panel is a nested card** (Severity: Medium) – within the `ai-card` section, the sparkline is wrapped in another `Card`, adding a second `ai-card` surface inside the same L1 area (`components/admin/ingestion/DatasetSnapshotSection.tsx:141-210`). The extra chrome and shadow create card explosion and complicate the intended L2 grouping.
5. **RAG Documents stats render as cards-of-cards** (Severity: Medium) – the “Total/Public/Private” tiles render via `StatCard`, which is its own `Card`, so three additional `ai-card` surfaces sit inside the Overview card, followed by `ai-panel` chips for doc types (`components/admin/ingestion/RagDocumentsOverview.tsx:27-72`, `components/ui/stat-card.tsx:1-32`). The cards-within-card pattern breaks the depth rhythm for this L1 section.

## Depth Map Diagram (Intended)
```
L0  AiPageChrome > AdminPageShell (page chrome, action bar)
L1  IngestionSubNav (sticky nav for Overview vs RAG Documents) ← tablist container, not mode toggle (`components/admin/navigation/IngestionSubNav.tsx:19-53`)
L1  Manual Ingestion card (workflow hero + controls)
    L2  Source rail (mode toggle + tab panels)
    L2  Configuration groups (update behavior grid, embedding model select)
    L2  Execution block (run button + progress)
    L2  Run log (log list)
    L2  Run summary / run feedback banner
L1  Dataset Snapshot + System Health (grouped because both surfaces summarize “current state”; they appear consecutively on the Overview tab and share audience expectations for live totals and health metrics; see `pages/admin/ingestion.tsx:98-105`)
    L2  Snapshot metrics + trend (cards/inset panels)
    L2  System health stat grid (inset tiles)
L1  RAG Documents Overview (stat summary + doc-type chips)
L1  Recent Runs (filters + table)
    L2  Filter strip (status/type/source inputs)
    L2  Runs table (data table grid + pagination)
```
Legend: L1 = primary card/section, L2 = grouped blocks, L3 = inline controls.

## Section Findings

### Manual Ingestion Workflow (L1)
- **Intended depth**: L1 card that contains a multi-step workflow (Source → Configuration → Execution → Logs → Summary).  
- **Workflow note**: the card represents a workflow rather than a settings grab bag—every sub-block (source tab, update strategy, execution, logs, stats) should stay within the single Manual Ingestion card so depth remains predictable (`components/admin/ingestion/ManualIngestionPanel.tsx:205-708`).  
- **Current violations**:
  - Source rail (`ManualIngestionPanel.tsx:229-266`) sits inside an `ai-panel`, but `.tabRail` adds another border + tinted background (`ManualIngestionPanel.module.css:1-9`), making the tabs read as an independent card instead of inline controls.  
  - Page input group (`ManualIngestionPanel.tsx:268-421`, `.pageInputGroup` at `ManualIngestionPanel.module.css:122-147`) is already visually complex; the dense borders and radius make it look like a nested card, pushing L3 controls into L2 territory.  
  - Run log panel (the `ai-panel` at `ManualIngestionPanel.tsx:605-657`) is sliced by two sequential `border-top` rules (`runLogPanel` and `runLogBody` in `ManualIngestionPanel.module.css:195-213`), so a single L2 section appears as multiple competing seams and invites “card explosion”.  
  - **Severity**: High / Medium-High for each violation above because all occur within the manual workflow card.

### Dataset Snapshot (L1)
- **Intended depth**: L1 card summarizing dataset totals and history.  
- **Violation**: The trend chart is wrapped in another `Card` (`DatasetSnapshotSection.tsx:174-210`), so the L2 group now renders as a second `ai-card`, doubling borders and shadows inside the same L1 area.  
- **Severity**: Medium (visual reinforcement of nested card surfaces).

### System Health (L1)
- **Intended depth**: L1 card that pairs with Dataset Snapshot to deliver operational signals.  
- **Current status**: Uses inset panels via `insetPanelStyles` (`SystemHealthSection.tsx:24-210`) and keeps everything inside a single card, so no additional depth violations detected. Grouping with Dataset Snapshot keeps the “status overview” experience consistent.

### RAG Documents Overview (L1)
- **Intended depth**: L1 card presenting document stats.  
- **Violation**: Three stat tiles render via `StatCard` (which is a `Card`, see `components/ui/stat-card.tsx:1-32`), and the doc-type chips use `ai-panel` (a bordered surface) inside the same card (`RagDocumentsOverview.tsx:27-72`), producing a “card within card” block of multiple L2 surfaces and triggering card explosion.  
- **Severity**: Medium.

### Recent Runs (L1)
- **Intended depth**: L1 card that anchors filters + table.  
- **Violation**: `filtersPanel` plus `tableShell` each draw their own border/background (`RecentRunsPanel.module.css:15-43`) even though the `DataTable` already renders `ai-table` (border/shadow defined in `styles/ai-design-system.css:990-1015`). The table is therefore double-bordered and no longer reads as a single L2 block.  
- **Severity**: High.

## Recommended Fixes (PR-sized batches)
1. **PR1 – Manual ingestion depth polish**
   - Remove or collapse the extra border/background from `manualStyles.tabRail`; let the `ai-panel` surface own the seam and rely on the shared tokens for hover/focus (`ManualIngestionPanel.tsx:229-266`, `ManualIngestionPanel.module.css:1-9`).  
   - Rework `pageInputGroup`/chip styles so they read as inline L3 controls (use `ai-panel` variants with lighter borders or background instead of full card chrome, per the depth doc).  
   - Flatten the run log separators: keep one owning border and adjust padding so the content is on a single L2 surface (`ManualIngestionPanel.tsx:605-657`, `ManualIngestionPanel.module.css:195-213`).
2. **PR2 – Summary cards for Dataset Snapshot + RAG Overview**
   - Replace the `Card` in the Dataset Snapshot “Trend” block with `ai-panel` or `inset-panel` markup so the group remains a single L2 surface (`DatasetSnapshotSection.tsx:141-210`).  
   - Swap the `StatCard` tiles in the RAG overview for lightweight panels or grid cells that don’t introduce nested `ai-card`s (`RagDocumentsOverview.tsx:27-72`, `components/ui/stat-card.tsx:1-32`). Possibly reuse the same `RunSummaryStatTile` pattern.  
3. **PR3 – Recent Runs container cleanup**
   - Remove the `tableShell` border/background so that the `ai-table` remains the sole L2 surface (`RecentRunsSection.tsx:998-1067`, `RecentRunsPanel.module.css:38-43`).  
   - Consider wrapping the filter inputs in a single `ai-panel` that sits in the card rather than reusing the bordered container plus `CardContent`. Adjust spacing so filter controls align with the table margin without adding another shadow.

## Do Not Change (Guardrails)
- Do not touch runtime logic, API calls, or state management while adjusting layout.  
- Do not edit `ai-design-system.css`; rely on existing tokens (`var(--ai-*)`) and components.  
- Do not introduce literal color values; use the token contract (`var(--ai-role-*, --ai-text-*, --ai-border-*)`).  
- Keep the fixes localized to ingestion dashboard files (components/admin/ingestion/** and their CSS modules).  
- Focus strictly on depth/hierarchy—avoid component behavior changes or new features until the depth fixes land.
