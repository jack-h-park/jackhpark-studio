---
name: admin-surface-depth-audit
description: Use this skill when the user says things like "admin UI messy", "nested cards", "double borders", "too many panels", "depth issue", "card explosion", "seams look wrong", "admin layout hierarchy", "ingestion dashboard feels cluttered", or "chat-config page structure is off" and the task is to audit or refine the structural hierarchy of admin surfaces. Use it for admin information architecture, section depth, seam ownership, nested-surface drift, primitive placement, and page-level hierarchy on the repo's admin surfaces. Do NOT use it for settings-policy decisions, drawer-only affordance tuning, or generic CSS token audits that are not about hierarchy and surface structure.
---

# When to use
- Use this wrapper to bind the canonical admin-surface hierarchy skill to this repo.
- Use it when the problem is hierarchy, too many framed regions, wrong depth, competing seams, or primitive-placement drift on admin pages.
- Do not use it for settings ownership/policy, drawer affordances, or purely cosmetic color-token issues.

# Canonical bindings
- Canonical skill: `jackhpark-ai-skills/skills/dev/admin-surface-depth-audit/SKILL.md`
- Local adapter: `docs/ui/admin-surface-hierarchy-audit-local-adapter.md`

# Workflow
1. Read the canonical skill.
2. Read the local adapter.
3. Apply the canonical workflow using this repo's admin depth vocabulary, primitive mappings, and page maps.
4. Keep the canonical output contract unless a local override below says otherwise.

# Local overrides
- Default target surfaces are this repo's admin ingestion and admin chat configuration pages.
- Keep fixes scoped to local primitive placement, feature markup, and feature CSS unless the adapter clearly points to a shared primitive problem.
