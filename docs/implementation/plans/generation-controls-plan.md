# Generation Controls Plan

## Decision

Implement the minimal administrator-owned reasoning-effort control now. Keep temperature behavior unchanged for existing models and omit temperature for GPT-5.6 models that reject non-default sampling parameters.

## Implemented scope

- Register GPT-5.6 Luna and Terra as models that require provider-managed temperature and support reasoning effort.
- Add one persisted Admin Chat Config setting: `generation.reasoningEffort`.
- Offer `provider-default`, `none`, `low`, `medium`, and `high` in the admin-only Generation controls card.
- Apply the setting only to supported OpenAI models; all other providers and models retain their existing behavior.

## Deferred design

The earlier proposal included per-purpose generation profiles, separate answer/query-rewrite/HyDE controls, deployment caps, and expanded telemetry fields. It is intentionally deferred because current operations have only two GPT-5.6 allowlisted models, no GPT-5.6 preset default, and no evidence that separate per-purpose tuning is needed.

The added abstraction would create more policy states than the current operator needs, and could obscure the existing preset-owned model behavior. Revisit it only after Langfuse shows sustained GPT-5.6 use and a measurable quality, latency, or cost reason to tune answer and retrieval-assist calls independently.

## Invariants

- End users cannot set temperature or reasoning effort.
- Existing preset values are unchanged.
- Existing temperature behavior remains: general answer temperature comes from `LLM_TEMPERATURE`; Reverse RAG and HyDE retain their current fixed temperatures.
- GPT-5.6 models omit the unsupported temperature parameter.
