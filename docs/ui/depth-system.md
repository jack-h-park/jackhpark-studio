## Depth System Policy

### 1 Purpose
- Keeps the Ingestion Dashboard scannable: predictable depth vocabulary avoids “card explosion” and lets reviewers hold layout choices accountable.
- Ensures hierarchy reflects workflows rather than arbitrary sections, so future editors can add content without breaking the glance behavior.
- Makes hierarchy decisions explicit and repeatable, which drives maintainability for teams adding new ingestion controls or telemetry views.

### 2 Definitions: Depth Levels
Depth references are literal in both markup and naming (e.g., `Section` for L1, `Card` for L2). Each depth has clear do/don’t boundaries.

- **L0 – Page**  
  - What belongs here: overall page shell, global navigation, hero callouts that frame the workflow.  
  - Must NOT belong: individual controls, nested cards, or inline groups that should live deeper.

- **L1 – Primary Sections**  
  - What belongs here: high-level buckets such as “Manual Ingestion” vs “Ingestion Status”; these are the top-level cards or sections that contain a workflow slice.  
  - Must NOT belong: single-row toggles, tables, or helpers that belong to a child depth.

- **L2 – Groups (within a section)**  
  - What belongs here: card bodies, grouped form rows, inset panels for emphasis, tables/lists that share a heading.  
  - Must NOT belong: standalone inline controls or micro helpers that should live under L3 semantics.

- **L3 – Controls/Inputs**  
  - What belongs here: buttons, toggles, text inputs, dropdowns, inline helper text.  
  - Must NOT belong: sections or cards—those are higher-level organizational constructs.

### 3 Allowed Containers & When to Use Them

- **Page-level Section container**  
  - Intended depth: L1.  
  - Visual semantics: use `spacing.section` vertical padding and `border.section` to frame the area without extra shadow; reserve stacked overflow for hero + section separation.  
  - Accessibility: ensure landmarks (e.g., `<section aria-labelledby="manual-ingestion">`) exist so assistive tech can skip between workflows.

- **Card (top-level)**  
  - Intended depth: L1–L2 depending on whether the card defines a whole section or just a grouped subsection.  
  - Visual semantics: single tokenized shadow (`shadow.card`) and border (`border.card`) with `spacing.md` around, avoiding additional gradients.  
  - Accessibility: use headers as landmarks and keep focus order strictly top-to-bottom.

- **Sub-card / Group card**  
  - Intended depth: L2.  
  - Visual semantics: lighter border-only treatment (`border.subtle`) with tight `spacing.sm` gutters; no extra drop shadow.  
  - Accessibility: provide meaningful titles; groupings should align with form fieldset semantics where possible.

- **Inset panel (for nested emphasis)**  
  - Intended depth: L2 when stacking within a card.  
  - Visual semantics: background tint through tokens like `background.elevated-1`, small radius, and `spacing.sm` padding; treat as callout without extra header chrome.  
  - Accessibility: optional `role="region"` with `aria-label` if it contains contextual instructions.

- **Divider group (no card, just separation)**  
  - Intended depth: L2–L3 depending on spacing (used when the section is already framed and only needs soft separation).  
  - Visual semantics: tokenized divider (`border.divider`) and `spacing.xs` for content spacing.  
  - Accessibility: ensure a single divider owns the visual cut; avoid stacking multiple unlabeled separators.

- **Inline header strip (label + control + helper + seam)**  
  - Intended depth: L3.  
  - Visual semantics: use text tokens (`text.label`, `text.helper`), place helper under label with `spacing.xs`.  
  - Accessibility: pair label/control with `aria-describedby`; keep toggles aligned to the label (no “floating control”).

- **Table/list container (Recent Runs)**  
  - Intended depth: L2 when it anchors a section; within it, rows are L3.  
  - Visual semantics: use responsive striping via `background.list-row`, `spacing.sm` padding, and `border.bottom` dividers; cards or sub-cards should not wrap the table unless additional grouping is needed.  
  - Accessibility: include column headers, `aria-live` for updates, and avoid nesting tables inside cards that would confuse focus or announce redundant groups.

### 4 Ingestion Dashboard: Canonical Depth Map
Aim for no more than one L1 container per workflow, with L2 and L3 content nested consistently.

- **Hero** – L0 entry point with call-to-action copy referencing Manual Ingestion and Recent Runs; no nested cards.  
- **Tabs (Overview / RAG Documents)** – L1 boundary with tablist semantics; each tab presents a distinct workflow depth, not a mode toggle.  
- **Manual Ingestion**  
  - Configuration (L2 card) → Grouped settings and teammates instructions.  
  - Execution (L2 card) → Run button + inline strip of controls (L3) where toggles stay near labels.  
  - Run Log (L2 table card) → Recent entries.  
  - Rationale: manual ingestion is a workflow with defined steps, so we keep grouped cards (config, execute, log) rather than scattering disparate controls across the page.  
- **Ingestion Status** – L1 section whose primary children are Dataset Snapshot + System Health; they share a card because both summarize the current state.  
  - Dataset Snapshot + System Health grouping: both are “current state” readings that users scan together, so a shared L2 card keeps depth consistent and avoids redundant headers.  
- **RAG Documents Overview** – L1 section tied to the RAG tab; content can reuse cards/sub-cards for document metadata.  
- **Recent Runs** – L2 list container within Overview with vertical spacing `spacing.md`; renders as a fueled table/list with status chips, not nested cards.

### 5 Anti-patterns

- **Card explosion** – each subsection becomes its own card; instead group minor controls inside an existing card or inline strip.  
- **Floating controls** – toggles pushed to the far-right; always align toggles near their label within the inline strip so the label-control relationship is perceivable.  
- **Competing seams** – multiple dividers with no single owner; designate one divider for the cut or combine content into one container.  
- **Mixed semantics** – tabs that act as mode toggles (e.g., “View” vs “Edit”). Use true mode toggles (inline control) when quick switch happens on the same panel; reserve tabs for distinct workflows or datasets.  
- **Over-nesting** – L1 card containing another L2 card containing an L3 card for a single control; simplify by lifting the child control into the parent and using inline strips or separators.

### 6 Naming & File Placement Rules

- **Component placement**  
  - `components/ui/*.tsx` + associated `*.module.css` contain domain-agnostic primitives (cards, tables, strips).  
  - `components/<domain>/*` wrap those primitives with ingest-specific behaviors.  
  - Example: `components/ui/card.tsx` used by `components/admin/ingestion/ManualIngestionPanel.tsx`.  
  - Exception: if a primitive is tightly coupled to a feature and cannot be generalized, document the justification in the PR.

- **File naming conventions**  
  - Use `kebab-case` for file names in `components/ui` (both `.tsx` and `.module.css`).  
  - Exported component names remain `PascalCase` to match React conventions.  
  - CSS module filename must match the TSX filename (e.g., `segmented-control.tsx` + `segmented-control.module.css`).  
  - Exceptions allowed when refactoring legacy files that still use a legacy naming scheme; such exceptions must include a migration plan and be reviewed explicitly.

### 7 Review Checklist
Copy these items into PR descriptions or checklists when reviewing ingestion UI changes:

- Depth correctness: each section/card is mapped to L0–L3 and follows the “what belongs here” rules.  
- Container correctness: selected container (card/sub-card/inset/divider/inline) matches the intended depth and use case.  
- Seam ownership: every divider or container edge has a single owner; no duplicated separators.  
- Mode toggle vs tab semantics: tabs only break workflows; short-lived mode switches use inline toggles.  
- Naming/placement: new primitives live in `components/ui` with kebab-case files, domain wrappers stay under `components/<domain>`.

When naming exceptions are unavoidable, document the reason and the migration path in the PR so the policy stays enforceable.
