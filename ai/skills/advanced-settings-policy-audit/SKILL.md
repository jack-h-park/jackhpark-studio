---
name: advanced-settings-policy-audit
description: Use this skill when the user says things like "should this setting be editable", "Advanced Settings policy", "preset-owned vs user override", "Auto-RAG conflict", "request-scoped vs persistent", "hide this control", "Preset Effects", "session override precedence", or "this settings toggle seems unsafe" and the task is to review or change the policy boundary of the chat Advanced Settings experience. Use it to decide which controls are managed configuration, user-overridable, request-scoped, or system-managed, and how that policy is enforced in the UI and runtime. Do NOT use it for visual styling, drawer spacing, dark-mode affordances, nested cards, messy admin UI, or general layout hierarchy.
---

# When to use
- Use this skill to audit ownership and enforcement of the chat Advanced Settings surface.
- Use it when the question is who owns a setting, whether it should be editable, how precedence should work, or whether UI and runtime enforcement still match.
- Do not use it for layout hierarchy, drawer affordances, or generic visual polish.

# Goals
- Classify each relevant control into the correct local ownership bucket.
- Verify that local precedence rules still match the intended policy.
- Verify that UI affordances, persistence behavior, and runtime enforcement stay aligned.
- Identify settings that create user-trust, system-safety, or RAG-correctness risk when misclassified.

# Inputs to inspect
- Shared method: `shared-docs/skills/settings-ownership-audit.md`
- Local adapter: `docs/chat/settings-ownership-audit-local-adapter.md`
- Local source docs named by the adapter
- Relevant local settings UI surfaces, runtime resolution paths, and preset/managed-config definitions named by the adapter

# Workflow
1. If the shared doc or local adapter has already been referenced in the conversation, reuse that context instead of re-reading. Otherwise read `shared-docs/skills/settings-ownership-audit.md` for the generic ownership-review method and `docs/chat/settings-ownership-audit-local-adapter.md` for this repo's vocabulary, classifications, preset model, UX mappings, and enforcement points.
2. Identify the local policy question: ownership classification, precedence conflict, persistent-vs-request-scoped behavior, hidden/read-only treatment, or runtime enforcement mismatch.
3. Use the adapter to map the question onto this repo's local settings vocabulary, managed-config model, and implementation entrypoints.
4. Review whether UI presentation, persistence, and runtime behavior agree on the same owner and precedence rule.
5. Report the narrowest policy failure and stop before drifting into layout or styling review.

# Output format
- Which local setting group or drawer section was reviewed
- Setting or control under review
- Current local ownership classification
- Expected local ownership classification
- Precedence or enforcement issue, if any
- Whether the issue is in: UI presentation | client persistence | server enforcement | runtime decision logic
- Whether the local violation affects: user trust | system safety | RAG correctness
- Primary classification
- Most likely owner layer
- Recommended correction: move to Preset Effects | remain as session-only user override | convert to request-scoped action | remain server/policy managed
- Impact
- Next single action

Required ending:
- `Primary classification:` ownership misclassification | precedence conflict | UI/runtime enforcement mismatch | unsafe persistence | ambiguous managed-state UX
- `Owner layer:` policy | UI behavior | runtime enforcement | persistence/session state
- `Impact:` user trust | system safety | RAG correctness
- `Next single action:` one concrete follow-up step only

# Common pitfalls
- Do not restate the full generic ownership framework here; use the shared doc.
- Do not inline the repo's entire setting taxonomy or preset matrix here; use the adapter.
- Do not turn a policy audit into a drawer-polish or admin-structure review.
- Do not assume a control is user-editable just because the system can technically execute that behavior.
- Do not stop at UI affordances if runtime enforcement still accepts forbidden state.

# References
- Shared reusable method: `shared-docs/skills/settings-ownership-audit.md`
- Local adapter: `docs/chat/settings-ownership-audit-local-adapter.md`
