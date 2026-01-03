# PostHog Dashboard — Core Operational Insights

These insights are **diagnostic and operator-driven**, scoped to the current PostHog free plan (2 alerts) and meant to backstop Alert A (p99 latency) and Alert B (abort spikes). They do **not** duplicate alert implementation details; instead they describe what each trend shows and how to interpret it alongside the alerting signals.

-## How this doc fits the Step 1–3 telemetry chain
- **Step 1 (intent + mapping in `docs/telemetry/alerting-contract.md`)** defines the alert contract and canonical PostHog signals that every downstream insight relies on.
- **Step 2 (same `docs/telemetry/alerting-contract.md`)** serves as the single source of truth for event/property names referenced in this file.
- **Step 3 (this doc + `docs/telemetry/posthog-ops.md`)** shows how those signals render as dashboards and how PostHog realizes the alerts; `posthog-ops.md` covers the PostHog-specific mechanics referred to below.
- These insights remain human-in-the-loop diagnostics, not direct paging rules.

## Prerequisites / Data contract
- **Event**: `chat_completion`
- **Required properties** (needed for the insights in this file):
  - `status`, `aborted`, `rag_enabled`
  - `env`, `preset_key`
  - `latency_ms`, `latency_llm_ms`, `latency_retrieval_ms`
  - `total_tokens`, `error_type`
  - `response_cache_hit`, `retrieval_cache_hit`
- If a property above is missing, the corresponding insight cannot be filtered or rendered; wait for PostHog ingestion (e.g., validate via Live events or PostHog’s event stream) before relying on the view.

## Environment filtering guidance
- Prefer `env != prod` while building or tuning these views; once stable, filter on `env=prod` for production monitoring.
- Treat `env` as a first-class filter to isolate traffic; mention the active environment in each insight’s description for clarity.
- Avoid hardcoding `env=prod` until the pipeline maintains ~50 knowledge requests/hour to keep staging signals visible.

## Alerts vs Insights
- **Alerts** are automated pages (two allowed: Alert A = P0, Alert B = P1). They use Trends/Alerts UI with `chat_completion` events and run on a schedule (`run alert every` / `check last`). They are constrained by plan limits and property availability.
- **Insights** are human-in-the-loop diagnostics (P0/P1) that operators review once an alert fires or when proactively auditing latency/abort behavior.
- Alert C remains **P2 doc-only** because the free plan disallows a third alert; the supporting insight lives here for manual comparison.

## Severity Labels Used in This Document
- **P0 (Primary Operational Signal — Alert A)**  
  Tied to Alert A (p99 latency, `chat_completion`, `latency_ms`). Monitored constantly by on-call responders.
- **P1 (Secondary Diagnostic Signal — Alert B + supporting cost/ratio signals)**  
  Typically referenced after P0/P1 alerts and used for root-cause work. Includes the Abort Rate trend and token-inflation signals.
- **P2 (Insight-only, Alert C doc-only)**  
  Remains in documentation because PostHog can display it, but we cannot page it without a paid plan.

## [P0] Chat Completion Count by Status
**Goal**: Surface whether aborted or errored runs are trending higher before or after Alert B fires.

- Event: `chat_completion` filtered by `status` (success/error/aborted).
- Use this to validate Alert B’s abort spike: if `aborted` is trending up while Alert B is quiet, inspect frontend disconnects or request cancellations.
- Also cross-check with Alert A: high `status=success` latency often precedes aborted spikes.

## [P0] Cache Effectiveness (Latency)
**Goal**: Support Alert C (doc-only) by comparing `latency_ms` between `response_cache_hit=true` and `false`.

- Trend shows the practical benefit of caching; when medians (PostHog’s “Property value → median”) converge, caching is not buying time.
- Use this when Alert A/P1 suspect retrieval inefficiency: high hit latency may justify tuning retrieval depth or cache TTLs.
- Remember: this insight cannot page automatically, so treat it as a manual sanity check (see Alert C doc for derived logic).

## [P0] Average Latency by Preset (Success Only)
**Goal**: Narrow alert scope to a preset after Alert A triggers.

- Focus on `chat_completion` filtered by `status=success` and `rag_enabled=true`; PostHog does not emit `intent`, so `rag_enabled` is the knowledge proxy.
- Sudden preset divergence after a deploy usually means prompt changes, retrieval depth differences, or spanning models.
- Use for rapid firewalling when Alert A spikes globally but one preset still looks healthy.

## [P0] Average Tokens by RAG On/Off (Total Count)
**Goal**: Cost proxy for RAG usage, correlated with Alert A when retrieval fan-out spikes.

- Plot total `total_tokens` per minute with separate series for `rag_enabled=true` vs `false`.
- Spikes in the RAG-enabled line often mirror `latency_ms` jumps because RAG expansions increase context size.
- Pair with Alert A: if latency jumps without tokens rising, suspect backend slowness rather than prompt explosion.

## [P1] Average Tokens by RAG On/Off (Average)
**Goal**: Understand per-request token inflation independently from traffic volume.

- Same filters as the count variant, but aggregate on the `total_tokens` property’s average (non-quantity). This smooths traffic noise when evaluating Alert A/B responses.
- Interpret increases as more context being stitched per request; correlate with `rag_enabled=true` to isolate knowledge traffic.
- Remains a diagnostic insight, not an alert.

## [P1] Chat Completion Error Count by Error Type
**Goal**: Diagnose the type of failures when `status=error` spikes or Alert B indicates platform instability.

- Group `chat_completion` events by `error_type` to see if timeouts, provider errors, or inflight cancellations dominate.
- Serves as the “why” after Alert B pages ops—if aborts are due to `timeout`, look at latency; if `unauthorized`, involve provider/config holders.
- Remains an insight (no alert) but is critical for prioritizing on-call responses.

## Priorities Recap
- **P0/Alert A**: `chat_completion` → `latency_ms` p99, monitored hourly.
- **P1/Alert B**: `chat_completion` aborted count (with `rag_enabled=true`), monitored hourly.
- **P2 (Alert C doc-only)**: Cache hit vs miss latency; manual inspection required.
