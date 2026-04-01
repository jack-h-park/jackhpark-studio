# Telemetry Contract Local Adapter

This document is the repo-specific adapter for the canonical playbook `jackhpark-ai-skills/playbooks/telemetry-contract-audit.md` and the canonical skill `jackhpark-ai-skills/skills/dev/telemetry-contract-audit/SKILL.md`.

It intentionally contains only the local signal vocabulary, canonical semantics, vendor surfaces, alert groups, and configuration controls needed to apply that method inside `nextjs-react-notion-x`.

## Local Vocabulary

- **Knowledge traffic**: the local operational scope for the main telemetry contract. In PostHog, `rag_enabled=true` is the practical proxy when direct intent filtering is unavailable.
- **Trace input / output summary**: the local PII-safe request summary emitted to Langfuse instead of raw prompts or raw responses.
- **Response cache hit**: local response-level cache truth signal.
- **Retrieval cache hit**: local retrieval-stage cache truth signal.
- **Retrieval attempted / retrieval used**: local runtime facts for whether the retrieval pipeline ran and whether its results actually fed the response.
- **Insufficient**: the local answer-quality flag guarded by retrieval usage and citation state.
- **Finish reason**: local terminal outcome classifier for success, error, or abort semantics.
- **Detail level**: the local telemetry fidelity tier (`minimal`, `standard`, `verbose`).
- **Config snapshot**: the local sanitized chat/rag settings snapshot attached to traces at higher detail levels.

## Primary Local Docs

- [docs/canonical/telemetry/alerting-contract.md](../../docs/canonical/telemetry/alerting-contract.md)
- [docs/telemetry/operations/telemetry-audit-checklist.md](../../docs/telemetry/operations/telemetry-audit-checklist.md)
- [docs/telemetry/implementation/telemetry-logging.md](../../docs/telemetry/implementation/telemetry-logging.md)
- [docs/telemetry/langfuse-guide.md](../../docs/telemetry/langfuse-guide.md)
- [docs/telemetry/posthog-ops.md](../../docs/telemetry/posthog-ops.md)
- [docs/telemetry/dashboards/langfuse-dashboard.md](../../docs/telemetry/dashboards/langfuse-dashboard.md)
- [docs/telemetry/dashboards/posthog-dashboard.md](../../docs/telemetry/dashboards/posthog-dashboard.md)
- [docs/telemetry/runbooks/oncall-runbook.md](../../docs/telemetry/runbooks/oncall-runbook.md)

## Canonical Local Telemetry Invariants

- Trace input and output summaries must exist on all important exits, including success, cache hit, abort, and error.
- Raw user content must not be stored unless the local PII override is explicitly enabled.
- Retrieval-attempt and retrieval-used signals must reflect actual runtime behavior rather than inferred provenance.
- `insufficient` is valid only under the local guarded conditions tied to retrieval usage and citation state.
- Cache-hit signals are monotonic local truths and must not flip after being established.
- Terminal outcome fields must classify completion state consistently across traces and analytics events.
- Missing values that are part of the local analytics contract should be emitted explicitly when required for stable dashboards.

## Local Event and Field Contract

### Shared Context Fields

The local analytics contract treats the following as shared context across emitted telemetry where applicable:

- `request_id`
- `env`
- `intent`
- `preset_key`
- `model`
- `timestamp`

### Canonical PostHog Events

- `chat_completion`
  - primary lifecycle event for each knowledge completion
  - includes latency, status, cache, abort, token, model, preset, and error fields
- `cache_decision`
  - local cache-effectiveness event for hit/miss monitoring
- `latency_breakdown`
  - local attribution event for total vs retrieval vs LLM latency

### Canonical Local Properties

Exact PostHog property names and their required semantics are defined in [docs/canonical/telemetry/alerting-contract.md](../../docs/canonical/telemetry/alerting-contract.md).

### Langfuse Request-Level Metadata

Exact trace metadata fields, `metadata.rag.*` structure, and summary field semantics are defined in [docs/telemetry/langfuse-guide.md](../../docs/telemetry/langfuse-guide.md).

## Local Trace / Span / Observation Mapping

### Trace-Level Contract

- Trace metadata carries local request identity, routing intent, cache truth, environment, provider/model resolution, and optional config snapshot state.
- Trace input and output panels must remain PII-safe by default.

### Canonical Local Observations

- `answer:llm`
  - generation lifecycle and terminal completion semantics
- `rag:root`
  - retrieval quality summary for knowledge traces
- `context:selection`
  - dedupe/quota/selection summary for knowledge traces
- `rag_retrieval_stage`
  - verbose retrieval diagnostics only

### Emission Rules

- `answer:llm` is the universal generation observation when a trace exists.
- Retrieval observations are local knowledge-only artifacts.
- Verbose retrieval-stage diagnostics are local verbose-only artifacts.
- Detail level determines whether config snapshots and retrieval observations appear.

## Local Vendor Surfaces

### Langfuse

Use Langfuse for:

- per-request traces
- observation-level verification
- trace input/output summary checks
- retrieval and generation observation review

Primary local references:

- `docs/telemetry/langfuse-guide.md`
- `docs/telemetry/dashboards/langfuse-dashboard.md`

### PostHog

Use PostHog for:

- canonical analytics events
- alert realization
- trend and aggregation checks
- cache hit/miss and latency comparisons

Primary local references:

- `docs/telemetry/posthog-ops.md`
- `docs/telemetry/dashboards/posthog-dashboard.md`

### Runbook Surface

Use the runbook when telemetry contract issues intersect with live alerts or observability coverage questions:

- `docs/telemetry/runbooks/oncall-runbook.md`

## Local Alert Taxonomy

The local alert contract is organized into three named groups:

- **Alert A**
  - end-to-end latency regression
- **Alert B**
  - abort rate spike
- **Alert C**
  - cache inefficiency / cache parity diagnostics

The exact trigger logic, severity rules, thresholds, and volume gates live in the canonical contract and vendor realization docs, not in this adapter.

## Local Config and Environment Controls

### Telemetry Controls

- `TELEMETRY_ENABLED`
- `TELEMETRY_SAMPLE_RATE_DEFAULT`
- `TELEMETRY_SAMPLE_RATE_MAX`
- `TELEMETRY_SAMPLE_RATE_OVERRIDE`
- `TELEMETRY_DETAIL_DEFAULT`
- `TELEMETRY_DETAIL_MAX`
- `TELEMETRY_DETAIL_OVERRIDE`

### Privacy Control

- `LANGFUSE_INCLUDE_PII`

### Analytics Export Controls

- `POSTHOG_API_KEY`
- `POSTHOG_HOST`

### Console / Domain Logging Controls

- `LOG_GLOBAL_LEVEL`
- `LOG_RAG_LEVEL`
- `LOG_INGESTION_LEVEL`
- `LOG_NOTION_LEVEL`
- `LOG_LLM_LEVEL`
- `LOG_TELEMETRY_LEVEL`
- `LOG_DB_LEVEL`

The local precedence and merge rules for these controls are defined in `docs/telemetry/implementation/telemetry-logging.md`.

## Repo-Specific Exclusions

- Do not treat local field names, event names, or observation names as shared vocabulary.
- Do not treat local alert groups as a universal alert taxonomy.
- Do not treat PostHog workarounds, plan limits, or dashboard layout choices as part of the reusable audit method.
- Do not use this adapter for retrieval-quality diagnosis of a single trace; that belongs to the RAG trace review workflow.
- Do not use this adapter for live incident response beyond contract verification and observability sanity.
- Do not treat local proxy fields as authoritative unless the canonical contract explicitly says they are.
