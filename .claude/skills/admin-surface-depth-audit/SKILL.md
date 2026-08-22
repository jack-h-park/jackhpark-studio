---
name: admin-surface-depth-audit
description: Use this skill when the user says things like "admin UI messy", "nested cards", "double borders", "too many panels", "depth issue", "card explosion", "seams look wrong", "admin layout hierarchy", "ingestion dashboard feels cluttered", or "chat-config page structure is off" and the task is to audit or refine the structural hierarchy of admin surfaces. Use it for admin information architecture, section depth, seam ownership, nested-surface drift, primitive placement, and page-level hierarchy on the repo's admin surfaces. Do NOT use it for settings-policy decisions, drawer-only affordance tuning, or generic CSS token audits that are not about hierarchy and surface structure.
---

# When to use

- Use this wrapper to bind the canonical admin-surface hierarchy skill to this repo.
- Use it when the problem is hierarchy, too many framed regions, wrong depth, competing seams, or primitive-placement drift on admin pages.
- Do not use it for settings ownership/policy, drawer affordances, or purely cosmetic color-token issues.

# Goals

- Map the target surface onto the depth model supplied by the local adapter.
- Identify hierarchy violations, nested-surface drift, or conflicting seam ownership.
- Verify that local primitive usage and component placement still match the intended structure.
- Produce a fix plan grouped into reviewable batches rather than scattered one-off tweaks.

# Method

## Admin Surface Hierarchy Audit

### Purpose

Use this method to review the structural hierarchy of dense admin surfaces
before changing visual styling. The goal is to identify the smallest
structural fix that restores a clear depth model.

### Review Steps

1. Identify the target page or surface and list its top-level workflow regions.
2. Map each region onto the local depth model supplied by the adapter.
3. Check which primitive owns the seam for each region.
4. Look for hierarchy failures:
   - nested framed surfaces that duplicate containment
   - competing seams where parent and child both draw strong boundaries
   - fragmentation where one logical workflow is split into too many shells
   - placement drift where a primitive is used at the wrong depth
   - mode-toggle misuse where structure changes instead of state
5. Recommend the smallest batch of fixes that restores one clear owner per
   seam.

### Review Checklist

- Depth mapping is explicit and consistent with the local depth model.
- Container choice matches the declared depth instead of layering extra shells.
- One container or divider owns each visible cut.
- Workflow boundaries use real sectioning, while short-lived state changes stay
  inside the current structure.
- Primitive naming and placement remain consistent with the local primitive and
  feature-boundary rules.

### Output Expectations

- Name the surface reviewed.
- State the intended depth map.
- Call out the dominant structural failure.
- Tie each finding to seam ownership rather than visual preference alone.
- End with one concrete next action.

### Boundaries

- Do not turn this into a token or color audit.
- Do not focus on drawer-only affordances unless the adapter says the drawer is
  part of the structural problem.
- Do not propose broad shared-primitive changes unless the issue clearly cannot
  be fixed in local composition or feature markup.

# Workflow

1. If the canonical playbook or local adapter has already been referenced in the conversation, reuse that context instead of re-reading.
2. Read the canonical playbook for the generic hierarchy-review method and the local adapter for repo-specific depth vocabulary, primitive mappings, and page maps.
3. Identify which local admin or operational surface is under review and which page-specific depth map applies.
4. Use the adapter to map local primitives, component boundaries, and page sections onto the shared depth and anti-pattern framework.
5. Classify the issue by structure: nested surfaces, competing seams, fragmentation, mode-toggle misuse, placement drift, or double framing.
6. Report the intended local depth map and the smallest useful batch of hierarchy fixes. Do not expand into settings policy or drawer-specific affordance work.

# Output format

- Surface reviewed
- Intended local depth map
- Key hierarchy findings
- Implicated local primitive or pattern
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

- Do not restate the playbook in full; use the canonical playbook.
- Do not inline full page maps or primitive matrices here; use the local adapter.
- Do not turn a hierarchy audit into a settings-policy review.
- Do not suggest moving feature-specific structure into shared primitives without checking the local placement rules.
- Do not report isolated visual nits without tying them to a hierarchy or seam problem.

# Local context

Repo-specific vocabulary, vendor surfaces, invariants, and control knobs live in
[`docs/ui/admin-surface-hierarchy-audit-local-adapter.md`](../../../docs/ui/admin-surface-hierarchy-audit-local-adapter.md). Read it before applying the method above.

# Local overrides

- Default target surfaces are this repo's admin ingestion and admin chat configuration pages.
- Keep fixes scoped to local primitive placement, feature markup, and feature CSS unless the adapter clearly points to a shared primitive problem.
