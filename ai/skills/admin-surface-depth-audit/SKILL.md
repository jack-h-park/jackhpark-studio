---
name: admin-surface-depth-audit
description: Use this skill when the user says things like "admin UI messy", "nested cards", "double borders", "too many panels", "depth issue", "card explosion", "seams look wrong", "admin layout hierarchy", "ingestion dashboard feels cluttered", or "chat-config page structure is off" and the task is to audit or refine the structural hierarchy of admin surfaces. Use it for admin information architecture, section depth, seam ownership, nested-surface drift, primitive placement, and page-level hierarchy on the repo's admin surfaces. Do NOT use it for settings-policy decisions, drawer-only affordance tuning, or generic CSS token audits that are not about hierarchy and surface structure.
---

# When to use
- Use this skill to review the structure of admin surfaces in this repo.
- Use it when the problem is hierarchy, too many framed regions, wrong depth, competing seams, or primitive-placement drift on admin pages.
- Do not use it for settings ownership/policy, drawer affordances, or purely cosmetic color-token issues.

# Goals
- Map the target admin surface onto the correct local depth model.
- Identify hierarchy violations, nested-surface drift, or conflicting seam ownership.
- Verify that local primitive usage and component placement still match the intended structure.
- Produce a fix plan grouped into reviewable batches rather than scattered one-off tweaks.

# Inputs to inspect
- Shared method: `shared-docs/skills/admin-surface-hierarchy-audit.md`
- Local adapter: `docs/ui/admin-surface-hierarchy-audit-local-adapter.md`
- Local audit and policy docs named by the adapter
- Target admin page, local primitives, and component mappings named by the adapter

# Workflow
1. If the shared doc or local adapter has already been referenced in the conversation, reuse that context instead of re-reading. Otherwise read `shared-docs/skills/admin-surface-hierarchy-audit.md` for the generic hierarchy-review method and `docs/ui/admin-surface-hierarchy-audit-local-adapter.md` for this repo's depth vocabulary, primitive mappings, page maps, and exclusions.
2. Identify which local admin surface is under review and which page-specific depth map applies.
3. Use the adapter to map local primitives, component boundaries, and page sections onto the shared depth and anti-pattern framework.
4. Classify the issue by structure: nested surfaces, competing seams, fragmentation, mode-toggle misuse, placement drift, or double framing.
5. Report the intended local depth map and the smallest useful batch of hierarchy fixes. Do not expand into settings policy or drawer-specific affordance work.

# Output format
- Which admin surface was reviewed: ingestion | chat-config | other admin page
- Intended local depth map
- Key hierarchy findings
- Which local primitive or pattern was implicated: `ai-card` | `ai-panel` | `inset-panel` | `ai-table` | `.ai-selectable`
- Primary classification
- Most likely owner layer
- Whether the recommended fix stays inside: feature component markup | feature CSS module | shared primitive placement or naming cleanup
- Fix priority
- Next single action

Required ending:
- `Primary classification:` nested-surface drift | competing seams | fragmentation | mode-toggle misuse | placement drift | double framing
- `Owner layer:` UI structure | component composition | primitive placement | feature markup | feature CSS module
- `Fix priority:` now | later
- `Next single action:` one concrete follow-up step only

# Common pitfalls
- Do not restate the shared hierarchy method or anti-pattern taxonomy in full; use the shared doc.
- Do not inline full page maps or primitive matrices here; use the adapter.
- Do not turn a hierarchy audit into a settings-policy review.
- Do not suggest moving feature-specific structure into shared primitives without checking the local placement rules.
- Do not report isolated visual nits without tying them to a hierarchy or seam problem.

# References
- Shared reusable method: `shared-docs/skills/admin-surface-hierarchy-audit.md`
- Local adapter: `docs/ui/admin-surface-hierarchy-audit-local-adapter.md`
