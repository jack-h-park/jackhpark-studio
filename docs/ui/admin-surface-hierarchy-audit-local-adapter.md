# Admin Surface Hierarchy Local Adapter

This document is the repo-specific adapter for the canonical playbook `jackhpark-ai-skills/playbooks/admin-surface-hierarchy-audit.md` and the canonical skill `jackhpark-ai-skills/skills/dev/admin-surface-depth-audit/SKILL.md`.

It intentionally contains only the local vocabulary, primitive mappings, page-specific hierarchy models, and current audit references needed to apply that method inside `nextjs-react-notion-x`.

## Local Vocabulary

- **L0 / L1 / L2 / L3**: the local depth labels used across admin surface reviews.
- **Page shell**: the outer admin frame and navigation chrome.
- **Section card**: a top-level framed admin section.
- **Inset panel / section**: a nested but subordinate content region inside a card.
- **Inline strip**: a compact row for labels, controls, and helper text.
- **Seam ownership**: the local rule that one container or divider should own each visible cut.
- **Card explosion**: the local name for over-fragmented layouts with too many peer surfaces.
- **Mode toggle vs tab**: the local distinction between short-lived state switches and true workflow boundaries.

## Primary Local Entrypoints

- Admin ingestion surface
- Admin chat configuration surface
- Shared admin navigation and page shell components
- Reusable admin structural primitives and feature wrappers

## Primary Local Docs

- [docs/ui/depth-system.md](../../docs/ui/depth-system.md)
- [docs/ui/depth-violation-checklist.md](../../docs/ui/depth-violation-checklist.md)
- [docs/ui/ingestion-depth-audit.md](../../docs/ui/ingestion-depth-audit.md)
- [docs/ui-audits/admin-ingestion-phase1.md](../../docs/ui-audits/admin-ingestion-phase1.md)
- [docs/ui/depth/admin-chat-config-depth-policy.md](../../docs/ui/depth/admin-chat-config-depth-policy.md)
- [docs/ui/audits/admin-chat-config-depth-audit.md](../../docs/ui/audits/admin-chat-config-depth-audit.md)
- [docs/ui/ui-primitives-policy.md](../../docs/ui/ui-primitives-policy.md)

## Repo-Specific Invariants

- Depth decisions in this repo are expected to be explicit and reviewable rather than implicit styling choices.
- One visible cut should have one owning seam; duplicate borders and stacked framed regions are local regressions.
- Top-level admin workflow areas should read as stable section boundaries, while short-lived mode changes should remain inside those boundaries.
- Shared primitives must stay domain-agnostic, and domain-aware compositions must stay in feature folders.
- Structural hierarchy fixes should remain localized to the owning admin surface and should not drift into runtime logic or unrelated feature changes.

## Local Review Checklist Notes

- Default checklist targets are admin ingestion and admin chat-config.
- Local primitive checks should call out `ai-card`, `ai-panel`, `inset-panel`, and `ai-table` explicitly.
- Placement review should enforce `components/ui` for primitives and `components/admin` for admin-specific composition.

## Repo-Specific Exclusions

- Do not use this adapter for settings ownership or policy questions; that belongs to the settings ownership adapter/workflow.
- Do not use this adapter for generic CSS token audits unless the token issue is directly causing hierarchy drift.
- Do not treat current page-specific findings as universal guidance for other repos.
- Do not use this adapter as a replacement for the shared hierarchy audit framework; it only supplies local mappings and examples.

## Local Primitive and Component Mapping

### Structural Primitives

- `ai-card`
  - Local top-level framed surface used for many L1 sections.
- `ai-panel`
  - Local subordinate framed or inset surface used for grouped content.
- `inset-panel`
  - Local lighter nested emphasis treatment.
- `ai-table`
  - Local framed table surface that should not be wrapped in an unnecessary second frame.
- `.ai-selectable`
  - Local shared selectable-state primitive used for consistent interactive affordances.

### Placement Model

- `components/ui/*`
  - Local home for domain-agnostic primitives.
- `components/admin/*`
  - Local home for admin-specific wrappers and workflows.

### Example Mappings

- Structural cards, tables, strips, and reusable layout primitives belong under the shared UI layer.
- Admin ingestion and admin chat-config components should compose those primitives without pushing feature-specific workflows back into the shared primitive layer.

## Page-Specific Depth Maps

### Admin Ingestion Surface

- **L0**
  - page shell, header chrome, top-level admin framing
- **L1**
  - ingestion sub-navigation
  - manual ingestion workflow
  - current-state summary sections
  - document overview
  - recent-runs anchor section
- **L2**
  - source rail
  - configuration groups
  - execution block
  - run log
  - grouped metrics, summaries, and status panels
  - filter strip and table container within recent runs
- **L3**
  - buttons, toggles, inputs, status chips, helper rows, short selection groups

### Admin Chat Configuration Surface

- **L0**
  - page frame and top-level admin navigation
- **L1**
  - top-level configuration cards such as core behavior, limits, allowlists, ranking, telemetry, caching, summaries, and session presets
- **L2**
  - inset sections and grouped internal blocks inside those cards
- **L3**
  - labels, textareas, radios, toggles, chips, and inline helper content

## Current Local Audit Examples

### Ingestion Surface Example Patterns

Use these local docs as examples of how the shared method appears in this repo:

- [docs/ui/ingestion-depth-audit.md](../../docs/ui/ingestion-depth-audit.md)
  - example of severity-ranked findings
  - example of intended depth map
  - example of PR-sized fix batching
- [docs/ui-audits/admin-ingestion-phase1.md](../../docs/ui-audits/admin-ingestion-phase1.md)
  - example of broader structural inventory
  - example of nested-surface and fragmentation analysis
  - example of interaction-contract and placement drift observations

### Admin Chat Configuration Example Pattern

- [docs/ui/audits/admin-chat-config-depth-audit.md](../../docs/ui/audits/admin-chat-config-depth-audit.md)
  - example of a mostly-stable surface with “no action” findings
- [docs/ui/depth/admin-chat-config-depth-policy.md](../../docs/ui/depth/admin-chat-config-depth-policy.md)
  - example of local red-flag rules and PR checklist for a specific admin page
