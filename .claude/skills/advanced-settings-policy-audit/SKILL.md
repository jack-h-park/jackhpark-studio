---
name: advanced-settings-policy-audit
description: Use this skill when the user says things like "should this setting be editable", "Advanced Settings policy", "preset-owned vs user override", "Auto-RAG conflict", "request-scoped vs persistent", "hide this control", "Preset Effects", "session override precedence", or "this settings toggle seems unsafe" and the task is to review or change the policy boundary of the chat Advanced Settings experience. Use it to decide which controls are managed configuration, user-overridable, request-scoped, or system-managed, and how that policy is enforced in the UI and runtime. Do NOT use it for visual styling, drawer spacing, dark-mode affordances, nested cards, messy admin UI, or general layout hierarchy.
---

# When to use
- Use this wrapper to bind the canonical settings-ownership skill to this repo.
- Use it when the question is who owns a setting, whether it should be editable, how precedence should work, or whether UI and runtime enforcement still match.
- Do not use it for layout hierarchy, drawer affordances, or generic visual polish.

# Canonical bindings
- Canonical skill: `jackhpark-ai-skills/skills/hybrid/advanced-settings-policy-audit/SKILL.md`
- Local adapter: `docs/chat/settings-ownership-audit-local-adapter.md`

# Workflow
1. Read the canonical skill.
2. Read the local adapter.
3. Apply the canonical workflow using this repo's Advanced Settings vocabulary, preset model, and enforcement points.
4. Keep the canonical output contract unless a local override below says otherwise.

# Local overrides
- Default scope is the chat Advanced Settings drawer and its server-side settings enforcement path.
- Keep the review focused on ownership, precedence, and enforcement. Hand off layout complaints to the admin-surface skill instead of expanding scope here.
