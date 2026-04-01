# Admin Depth Review Local Supplement

This document is the repo-local supplement to the canonical playbook `jackhpark-ai-skills/playbooks/admin-surface-hierarchy-audit.md`.

Use the canonical playbook for the reusable review checklist. Use this local supplement only for this repo's preferred wording when reviewing admin ingestion and admin chat-config changes.

## Local Review Prompts

- **Depth mapping**: Have you assigned each new section or card to L0-L3 and kept the hierarchy consistent with this repo's depth model?
- **Container correctness**: Are you using the right local surface primitive (`ai-card`, `ai-panel`, `inset-panel`, `ai-table`) instead of stacking extra borders or shadows?
- **Seam ownership**: Does only one container or divider own each visible cut?
- **Mode toggle vs tab**: If you added tabs, do they break a workflow boundary rather than toggling a short-lived mode inside the same card?
- **Naming and placement**: Are domain-agnostic primitives still under `components/ui` and admin-specific composition still under `components/admin`?

## Repo-Specific Scope

- Default target surfaces are `/admin/ingestion` and `/admin/chat-config`.
- Recent-runs tables should not gain an unnecessary extra frame around `ai-table`.
- Short-lived mode switches inside a card should prefer inline controls over new tab shells.
