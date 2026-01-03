# Product Telemetry & Insights

This section translates **system telemetry into product meaning**.

While `docs/telemetry/` defines _what signals exist_ and _how alerts are triggered_,  
the documents under `docs/product/` explain **how those signals should be interpreted,
prioritized, and acted upon from a product perspective**.

---

## Purpose

Product telemetry exists to answer questions like:

- _Is the user experience getting worse in ways users actually feel?_
- _Which failures deserve immediate product attention vs. technical tuning?_
- _When is an alert a real product risk vs. background noise?_

These docs deliberately avoid:

- implementation details
- infrastructure diagnostics
- dashboard wiring

Those belong in `telemetry/` and `operations/`.

---

## How This Section Fits the System

```
Telemetry Signals (Langfuse / PostHog)
        ↓
Operational Alerts & Dashboards
        ↓
Product Interpretation (THIS SECTION)
        ↓
Product Decisions (UX, roadmap, prioritization)
```

- **Telemetry** answers: _What happened?_
- **Operations** answers: _Is the system healthy right now?_
- **Product docs** answer: _What does this mean for users and the product?_

---

## Key Documents

### 📄 Telemetry → Product Mapping

**`telemetry-to-product.md`**

The primary interpretation guide that explains:

- What each alert (A/B/C) means in user terms
- When product teams should care
- When _not_ to overreact
- How alerts map to UX degradation, trust erosion, or churn risk

This is the **canonical entry point** for product stakeholders.

---

## Alert Interpretation Philosophy

Product impact is **not binary**.

An alert firing does _not_ automatically mean:

- a feature is broken
- a rollback is required
- a roadmap change is needed

Instead, alerts should be evaluated across:

- duration
- recurrence
- user segment affected
- correlation with other signals

This section documents that judgment layer explicitly so decisions remain consistent over time.

---

## What This Section Does _Not_ Contain

To keep boundaries clear, this folder intentionally excludes:

- Alert thresholds or math  
  → see `docs/telemetry/alerting-contract.md`
- Dashboard wiring or PostHog constraints  
  → see `docs/telemetry/posthog-ops.md`
- On-call procedures  
  → see `docs/telemetry/runbooks/`
- Incident timelines or remediation steps  
  → see `docs/incidents/`

---

## Audience

These docs are written for:

- Product Managers
- Tech Leads making roadmap tradeoffs
- Engineers evaluating whether an alert is “product-real”
- Anyone deciding _what to do next_ after an alert fires

---

## Guiding Principle

> **Telemetry is a signal — product judgment gives it meaning.**

If you are asking:

- _“Should we act on this?”_
- _“Is this a user problem or a system optimization?”_
- _“Does this change priorities?”_

You are in the right place.

---

## Future Additions (Planned)

Potential future docs in this section may include:

- User-segment–specific alert interpretation
- Alert fatigue prevention heuristics
- Product-level SLO definitions
- Historical examples of alerts → product decisions

These will be added only when they clarify decisions, not duplicate telemetry docs.
