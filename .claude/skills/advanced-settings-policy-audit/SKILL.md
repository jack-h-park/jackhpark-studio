---
name: advanced-settings-policy-audit
description: Use this skill when the user says things like "should this setting be editable", "Advanced Settings policy", "preset-owned vs user override", "Auto-RAG conflict", "request-scoped vs persistent", "hide this control", "Preset Effects", "session override precedence", or "this settings toggle seems unsafe" and the task is to review or change the policy boundary of the chat Advanced Settings experience. Use it to decide which controls are managed configuration, user-overridable, request-scoped, or system-managed, and how that policy is enforced in the UI and runtime. Do NOT use it for visual styling, drawer spacing, dark-mode affordances, nested cards, messy admin UI, or general layout hierarchy.
---

# When to use

- Use this wrapper to bind the canonical settings-ownership skill to this repo.
- Use it when the question is who owns a setting, whether it should be editable, how precedence should work, or whether UI and runtime enforcement still match.
- Do not use it for layout hierarchy, drawer affordances, or generic visual polish.

# Goals

- Classify each relevant control into the correct ownership bucket.
- Verify that precedence rules still match the intended policy.
- Verify that UI affordances, persistence behavior, and runtime enforcement stay aligned.
- Identify settings that create user-trust, system-safety, or correctness risk when misclassified.

# Method

## Settings Ownership Audit

### Purpose

Use this method to review who owns a setting, how precedence should work, and
whether UI, persistence, and runtime enforcement all reflect the same policy.

### Review Steps

1. Identify the setting or setting group under review.
2. Use the adapter to map the control into the local ownership vocabulary.
3. Check whether the current behavior matches the intended bucket:
   - managed or preset-owned
   - session-only user override
   - request-scoped action
   - server-managed or policy-only control
4. Compare three layers for consistency:
   - UI presentation and affordances
   - client persistence or session behavior
   - server or runtime enforcement
5. Classify the narrowest failure:
   - ownership misclassification
   - precedence conflict
   - UI and runtime mismatch
   - unsafe persistence
   - ambiguous managed-state UX

### UX Presentation Rules

- Managed settings should prefer read-only summary presentation over disabled
  low-level controls.
- The user should be able to identify the single managed source of truth for a
  settings surface.
- User-editable overrides should live in a clearly separate override zone.
- Divergence from the managed baseline should surface as an explicit custom or
  override state.
- Reset should return the surface to the managed baseline and clear the custom
  state.

### Output Expectations

- Name the control reviewed.
- State current and expected ownership.
- Identify where enforcement drift exists, if any.
- Map the issue to the smallest owner layer.
- End with one concrete next action.

### Boundaries

- Do not turn this into a layout or visual polish review.
- Do not assume editability just because the runtime can technically support it.
- Do not stop at UI behavior if forbidden state is still accepted downstream.

# Workflow

1. If the canonical playbook or local adapter has already been referenced in the conversation, reuse that context instead of re-reading.
2. Read the canonical playbook for the generic ownership-review method and the local adapter for repo-specific vocabulary, classification rules, managed-config model, and enforcement points.
3. Identify the local policy question: ownership classification, precedence conflict, persistent-vs-request-scoped behavior, hidden or read-only treatment, or runtime enforcement mismatch.
4. Use the adapter to map the question onto the local settings vocabulary, managed-config model, and implementation entrypoints.
5. Review whether UI presentation, persistence, and runtime behavior agree on the same owner and precedence rule.
6. Report the narrowest policy failure and stop before drifting into layout or styling review.

# Output format

- Setting group or surface reviewed
- Setting or control under review
- Current local ownership classification
- Expected local ownership classification
- Precedence or enforcement issue, if any
- Whether the issue is in: UI presentation | client persistence | server enforcement | runtime decision logic
- Whether the local violation affects: user trust | system safety | product correctness
- Primary classification
- Most likely owner layer
- Recommended correction
- Impact
- Next single action

Required ending:
- `Primary classification:` ownership misclassification | precedence conflict | UI/runtime enforcement mismatch | unsafe persistence | ambiguous managed-state UX
- `Owner layer:` policy | UI behavior | runtime enforcement | persistence/session state
- `Impact:` user trust | system safety | product correctness
- `Next single action:` one concrete follow-up step only

# Common pitfalls

- Do not restate the full ownership framework here; use the canonical playbook.
- Do not inline the repo's entire setting taxonomy or preset matrix here; use the local adapter.
- Do not turn a policy audit into a drawer-polish or admin-structure review.
- Do not assume a control is user-editable just because the system can technically execute that behavior.
- Do not stop at UI affordances if runtime enforcement still accepts forbidden state.

# Local context

Repo-specific vocabulary, vendor surfaces, invariants, and control knobs live in
[`docs/chat/settings-ownership-audit-local-adapter.md`](../../../docs/chat/settings-ownership-audit-local-adapter.md). Read it before applying the method above.

# Local overrides

- Default scope is the chat Advanced Settings drawer and its server-side settings enforcement path.
- Keep the review focused on ownership, precedence, and enforcement. Hand off layout complaints to the admin-surface skill instead of expanding scope here.
