# UI docs

This folder mixes **active UI policy** with **surface-specific audit material**. Read it by role so you do not over-open one-off audits during normal work.

## Read by default

### Canonical / policy
- `depth-system.md` — the primary structural hierarchy contract for admin UI depth, containers, seams, and anti-patterns.
- `ui-primitives-policy.md` — naming and placement rules for `components/ui`.
- `drawer-ui-contract.md` — drawer-scoped affordance rules when the task is explicitly about drawer visibility or row/divider behavior.

### Operational / default audit inputs
- `ingestion-depth-audit.md` — current default audit input for ingestion dashboard hierarchy issues.
- `depth/admin-chat-config-depth-policy.md` — current default depth policy for admin chat-config work.

## Historical / reference context

- `audits/admin-chat-config-depth-audit.md` — point-in-time audit summary for admin chat-config; use when you need background or want to compare against a prior review.
- `../ui-audits/admin-ingestion-phase1.md` — broader phase-specific ingestion audit; useful for historical context, not the first read for a routine depth audit.
- `color-audit.md` — token/color exception inventory; not a default depth-audit input unless hierarchy issues are being driven by color or token misuse.
- `notion-polish-matrix.md` and `notion-polish-rollout.md` — Notion rendering parity/polish docs; separate from admin surface hierarchy work.

## Selection rules

- For admin hierarchy work, start with `depth-system.md` plus the one audit or policy doc that matches the target surface.
- Do not open every old audit by default; choose the surface-specific one first.
- Use `drawer-ui-contract.md` only when the issue is drawer-scoped. Do not use it as a general admin layout guide.
- Use `color-audit.md` or Notion polish docs only when the task is specifically about those domains.
