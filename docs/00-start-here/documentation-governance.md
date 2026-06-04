# Documentation Governance

This document defines how repository documentation should be updated when the codebase changes. It complements [docs/README.md](../README.md) by focusing on ownership and update rules rather than navigation.

## Core Rules

- Update the source-of-truth document first, then update supporting docs that derive from it.
- Do not redefine shared terminology outside of [terminology.md](./terminology.md).
- Do not put operational instructions in audits, postmortems, or historical plans.
- Prefer links over duplication when the same concept spans multiple folders.

## Documentation Roles

### Entrypoint docs

These are the first documents most contributors or reviewers will open.

- `readme.md`
- `docs/README.md`
- `docs/00-start-here/repository-map.md`
- `contributing.md`

Keep these concise, current, and high-signal. They should route readers to the right detailed doc, not try to contain every detail.

### Canonical docs

These define stable meanings, invariants, or contracts.

- `docs/00-start-here/terminology.md`
- `docs/canonical/**`
- selected principle docs under `docs/principles/`

If a behavior or term change affects policy, contract, or invariant semantics, update the canonical doc before updating operational or UX-facing docs.

### Operational docs

These explain how to execute current workflows.

- `docs/operations/**`
- `docs/chat/**`
- `docs/ui/**`
- parts of `docs/telemetry/**`
- `docs/testing/**`

These documents should reflect the current implementation and should link back to their governing canonical docs.

### Historical/reference docs

These preserve rationale and prior investigations.

- `docs/analysis/**`
- `docs/ui-audits/**`
- `docs/incidents/**`
- `docs/implementation/plans/**`
- `docs/debug/**`

Do not treat these as the default place to document current behavior.

## Change Triggers

When the code changes in the following ways, the listed docs should be reviewed in the same change or immediately after.

### Stack or runtime shape changes

Examples:

- Next.js or React major version changes
- Pages Router vs App Router boundary changes
- major execution-path changes in chat or admin flows

Review:

- `readme.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/00-start-here/repository-map.md`
- `contributing.md`

### Environment variable or runtime configuration changes

Examples:

- new required env vars
- renamed model/config env vars
- local backend configuration changes

Review:

- `.env.example`
- `readme.md`
- `docs/operations/local-llm-operations-checklist.md`
- any affected operational guide under `docs/operations/` or `docs/chat/`

### Chat model, preset, or guardrail changes

Examples:

- new LLM allowlist entries
- preset value changes
- Safe Mode behavior changes
- retrieval enhancement policy changes

Review:

- `docs/chat/chat-user-guide.md`
- `docs/chat/session-presets.md`
- `docs/chat/settings-ownership-audit-local-adapter.md`
- `docs/canonical/guardrails/guardrail-system.md`
- `docs/canonical/rag/rag-system.md`

### Telemetry or logging changes

Examples:

- new trace fields
- changed log semantics
- changed alerting/ownership expectations

Review:

- `docs/telemetry/implementation/telemetry-logging.md`
- `docs/telemetry/langfuse-guide.md`
- `docs/telemetry/README.md`
- `docs/canonical/telemetry/alerting-contract.md`

### Admin or UI contract changes

Examples:

- drawer behavior changes
- design token policy changes
- admin IA or hierarchy changes

Review:

- `docs/ui/drawer-ui-contract.md`
- `docs/ui/README.md`
- `docs/canonical/design-system/ai-design-system.md`
- `docs/css-guardrails.md`
- `docs/00-start-here/repository-map.md` if user-facing routing or ownership moved

## Minimal Documentation Checklist For PRs

Before merging a code change, check:

- Does this change modify a canonical term, invariant, or policy?
- Does this change alter setup, environment, routing, or stack framing?
- Does this change alter chat settings, presets, model choices, or retrieval behavior?
- Does this change alter telemetry, logging, or operational procedures?
- Does this change belong in an operational doc, or only in historical/reference context?

If the answer is yes to any of the first four, update the matching docs in the same branch unless there is a documented reason not to.

## Anti-Patterns

- Leaving root docs accurate only “in spirit” while implementation-facing docs quietly diverge
- Documenting current behavior only in an audit or incident write-up
- Copying the same model list, stack summary, or setup steps into many files
- Updating UX wording without checking the governing canonical contract

## Verification

At minimum, verify:

- local markdown links still resolve in edited entrypoint docs
- `pnpm check:ai-docs` still passes
- changed docs point to the right canonical contract when policy is involved
