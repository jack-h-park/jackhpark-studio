# Langfuse → PostHog Event Mapping

This document defines how **Langfuse telemetry is projected into PostHog events** for
alerts, dashboards, and product analytics.

Phase 2 answers:

> “Which signals leave Langfuse, in what shape, and for what purpose?”

---

## How these docs relate

- Step 1 (`langfuse-alert.md`) defines the canonical alerts that depend on the PostHog signals listed below; any change to those alerts should drive revisions here.
- This document is the single source of event/property names that Step 3 relies on—no downstream insight should reference a signal outside this taxonomy.
- Changes to this file must be reconciled with Step 1 severity/trigger rules and Step 3 dashboards or alerts before deployment.

---

## Scope & Non‑Goals

**In Scope**

- Mapping Langfuse traces, observations, and scores into PostHog events
- Defining canonical event names and properties
- Ensuring alert‑grade signals are preserved with minimal distortion

**Out of Scope**

- PostHog UI setup
- Alert configuration clicks
- Webhook / ingestion implementation details

---

## Design Principles

1. **Langfuse remains the source of truth**
   - PostHog receives _derived_ signals, not raw prompts or spans

2. **Events represent decisions, not internals**
   - One event = one operational or product‑relevant fact

3. **Minimal but sufficient**
   - Emit only what is needed for dashboards, alerts, and funnels

4. **Stable schemas**
   - Event names and property keys must be version‑stable

---

## Event Categories

PostHog events fall into four categories:

1. **Request Lifecycle**
2. **Retrieval Quality**
3. **Performance & Reliability**
4. **Caching & Cost Signals**

---

## Canonical Context (Attached to All Events)

Every PostHog event MUST include the following shared properties:

| Property     | Source                                 | Notes                   |
| ------------ | -------------------------------------- | ----------------------- |
| `request_id` | Langfuse `requestId`                   | Join key across systems |
| `env`        | Tag `env:*`                            | dev / staging / prod    |
| `intent`     | Tag `intent:*`                         | knowledge / chitchat    |
| `preset`     | Tag `preset:*`                         | logical configuration   |
| `model`      | metadata.llmResolution.resolvedModelId | Sanitized               |
| `timestamp`  | event time                             | Server‑side             |

---

## Event 1 — `chat_request_completed`

**Purpose**  
Primary lifecycle event representing a completed request.

**Source**

- Langfuse Trace (finalized)

**Emitted When**

- Request completes successfully or aborts

**Key Properties**

| Property          | Source                |
| ----------------- | --------------------- |
| `duration_ms`     | Trace duration        |
| `aborted`         | metadata.aborted      |
| `response_cache_hit` | metadata.cache.responseHit |
| `retrieval_cache_hit` | metadata.cache.retrievalHit |
| `answer_chars`    | Output.answer_chars   |
| `citations_count` | Output.citationsCount |

**Used By**

- Alert A (p99 regression) and dashboard tiles 1–3 via `duration_ms`
- Alert B (abort rate) via `aborted`
- Alert C-2 and dashboard tile 8 by comparing `duration_ms` across `response_cache_hit` filters
- PostHog alerts rely on `response_cache_hit` to split hits vs misses during caching investigations

---

## Event 2 — `retrieval_evaluated`

**Purpose**  
Represent the outcome of retrieval for a knowledge request.

**Source**

- Langfuse Scores + metadata.rag.\*

**Emitted When**

- Retrieval was attempted

**Key Properties**

| Property              | Source                           |
| --------------------- | -------------------------------- |
| `retrieval_attempted` | metadata.rag.retrieval_attempted |
| `retrieval_used`      | metadata.rag.retrieval_used      |
| `highest_score`       | score: retrieval_highest_score   |
| `insufficient`        | score: retrieval_insufficient    |

**Used By**

- Retrieval quality dashboards (Step 3 tiles 5–6) and Alert A correlation when retrieval quality degrades
- Alert A’s diagnosis checklist uses these scores to decide if retrieval or LLM is driving the tail
- Ranking experiments that tune retrieval ordering for knowledge traffic

---

## Event 3 — `auto_triggered`

**Purpose**  
Track Auto / multi‑query activation as a cost and quality lever.

**Source**

- metadata.autoTriggered

**Emitted When**

- Auto logic evaluated (true or false)

**Key Properties**

| Property         | Source                 |
| ---------------- | ---------------------- |
| `auto_triggered` | metadata.autoTriggered |
| `winner`         | metadata.winner        |
| `alt_type`       | metadata.altType       |

**Used By**

- Cost effectiveness analysis and Platform Health tiles that surface auto-trigger ratios
- Alternative routing for Step 3 when Alert B points at multi-query streaming behaviors

---

## Event 4 — `cache_decision`

**Purpose**  
Expose caching effectiveness to PostHog.

**Source**

- metadata.cache.\*

**Emitted When**

- Cache decision finalized

**Key Properties**

| Property              | Source                         |
| --------------------- | ------------------------------ |
| `response_cache_hit`  | metadata.cache.responseHit     |
| `retrieval_cache_hit` | metadata.cache.retrievalHit    |
| `cache_strategy`      | metadata.responseCacheStrategy |

**Used By**

- Alert C (hit-rate collapse) and Dashboard tile 7 via `response_cache_hit`
- Cost optimization dashboards looking at `cache_strategy`
- Step 3 cache sweet-spot diagnostics that link to `chat_request_completed` latency as part of Tile 8

---

## Event 5 — `latency_breakdown`

**Purpose**  
Enable latency attribution outside Langfuse.

**Source**

- Observations (aggregated)

**Emitted When**

- All required observations exist

**Key Properties**

| Property               | Source                  |
| ---------------------- | ----------------------- |
| `latency_total_ms`     | Trace duration          |
| `latency_retrieval_ms` | Observation: retrieval  |
| `latency_llm_ms`       | Observation: answer:llm |

**Used By**

- Step 3 latency tiles 5–6 plus Alert A’s investigation playbook
- Cache latency parity investigations in Alert C-2

---

## Field Normalization Rules

- Boolean values MUST remain booleans
- Missing data MUST be explicit (`null`), not omitted
- Numeric units:
  - Latency → milliseconds
  - Scores → normalized floats (0–1)

---

## Data Volume & Sampling

- Only **knowledge traffic** is exported by default
- Chitchat may be sampled or excluded
- Sampling decisions must be uniform across events

---

## Failure Handling

- PostHog export failure must NOT block Langfuse ingestion
- Failed exports are logged, not retried synchronously
- Partial events are preferable to dropped requests

---

## Output of Step 2

At the end of Phase 2, the system has:

- A stable event taxonomy
- Clear property contracts
- Alert‑safe signals mapped out of Langfuse
- A foundation for PostHog dashboards and alerts

---

## Next Phase

**Phase 3 — PostHog Dashboards & Alerts**  
Defines how these events are visualized and alerted on in PostHog.

---

End of specification.
