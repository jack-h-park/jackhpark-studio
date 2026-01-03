# Telemetry → Product Interpretation Guide

This document bridges **telemetry signals and alerts** with **user experience and product decisions**.

Its purpose is to ensure that when a metric spikes or an alert fires, engineers, PMs, and on‑call responders share the same understanding of **what users are experiencing** and **what product‑level action is appropriate**.

---

## How to Read This Document

- This is **not** a root‑cause analysis or debugging guide.
- It focuses on **meaning**, not mechanics:
  - _What does this signal mean for users?_
  - _Why does it matter for the product?_
  - _What kinds of decisions does it typically trigger?_
- Technical implementation details live in the telemetry docs; this file translates those signals into **product semantics**.

---

## Alert → User Impact Map

| Alert                                 | Telemetry Signal                   | What the User Experiences                | Product Interpretation        | Typical Decisions                             |
| ------------------------------------- | ---------------------------------- | ---------------------------------------- | ----------------------------- | --------------------------------------------- |
| **Alert A — P99 Latency Regression**  | `chat_completion.latency_ms (p99)` | Responses feel stalled or unreliable     | System is perceived as _slow_ | Rollback, model fallback, response shortening |
| **Alert B — Abort Spike (Knowledge)** | `chat_completion.aborted = true`   | User gives up mid‑answer                 | Active UX failure             | Streaming tweaks, progressive answers         |
| **Alert C — Cache Inefficiency**      | Cache hit ≈ miss latency           | No visible improvement (but hidden cost) | Cost/scale regression         | Cache strategy redesign                       |

---

## Alert‑Level Product Semantics

### 🔴 Alert A — P99 Latency Regression

**What users feel**

- “Sometimes it just hangs.”
- “It eventually answers, but I don’t trust it.”

**Why this matters**

- p50 latency often looks healthy while **trust erodes at the tail**.
- p99 regressions are the earliest indicator of perceived system instability.

**Typical product responses**

- Temporarily downgrade to faster / cheaper models
- Reduce answer verbosity or context size
- Disable non‑essential retrieval stages

---

### 🔴 Alert B — Abort Spike (Knowledge Requests)

**What users feel**

- They leave before an answer completes.
- They assume the system is broken or unreliable.

**Why this matters**

- Abort events represent **confirmed UX failure**, not just risk.
- Abort spikes usually lag p99 latency increases and validate real user pain.

**Typical product responses**

- Show partial answers earlier
- Adjust streaming chunk sizes
- Introduce “summary first” responses for long answers

---

### 🟠 Alert C — Cache Inefficiency

**What users feel**

- Often nothing directly noticeable.

**Why this matters**

- Cache exists but provides no benefit:
  - Latency savings are gone
  - Costs still increase
- This silently erodes scalability.

**Typical product responses**

- Revisit cache key granularity
- Ensure retrieval truly skips on cache hits
- Re‑evaluate early vs late cache placement

---

## Signal Priority (Product View)

| Situation                  | Interpretation                        |
| -------------------------- | ------------------------------------- |
| Alert A + Alert B          | 🚨 Immediate UX failure               |
| Alert A only (short‑lived) | 🟡 Monitor                            |
| Alert B only               | 🔍 Likely frontend or client behavior |
| Alert C only               | 🟠 Cost and scale debt                |

---

## What _Not_ to Overreact To

- A rise in p50 latency alone does **not** imply UX failure.
- Alert C without Alert A does **not** indicate user dissatisfaction.
- Short‑lived p99 spikes should be observed before triggering large rollbacks.

---

## Relationship to Other Documentation

- **Telemetry contract & alert definitions**  
  → `docs/telemetry/alerting-contract.md`
- **On‑call response procedures**  
  → `docs/telemetry/runbooks/oncall-runbook.md`
- **PostHog dashboards and alert mechanics**  
  → `docs/telemetry/posthog-ops.md`

---

## Why This Document Exists

Telemetry tells us _what changed_.  
This guide explains _why it matters_.

By separating signal definition from product interpretation, teams can:

- Respond faster during incidents
- Avoid misaligned decisions
- Keep product quality aligned with user perception
