---
name: telemetry-contract-audit
description: Use this skill when the user says things like "telemetry looks wrong", "Langfuse trace looks wrong", "PostHog inconsistency", "event fields changed", "field semantics drifted", "finish reason is wrong", "cache semantics look off", "PII boundary check", "sampling/detail issue", "telemetry contract drift", or "dashboards don't match reality" and the task is to verify that this repository's telemetry still obeys its documented signal contract. Use it for contract-level review of field semantics, summaries, cache truthfulness, finish/outcome semantics, privacy boundaries, and telemetry-control behavior. Do NOT use it for diagnosing a single RAG retrieval issue, reviewing citation quality in one trace, running live incident triage after the alert is already understood, or doing broad product interpretation.
---

# When to use
- Use this skill to audit whether telemetry still tells the truth about runtime behavior in this repo.
- Use it when the question is semantic correctness, contract drift, missing summaries, cache truthfulness, finish/outcome classification, privacy boundaries, or telemetry-control behavior.
- Do not use it for single-trace retrieval diagnosis, on-call incident response, or general debugging once the telemetry contract violation is no longer the main question.

# Goals
- Verify that the local telemetry contract still matches emitted runtime evidence.
- Verify that local traces, analytics events, and summary outputs stay semantically consistent.
- Verify that privacy and detail-level controls still enforce the intended local policy.
- Classify the narrowest telemetry contract failure and identify the smallest owner layer that must change.

# Inputs to inspect
- Shared method: `shared-docs/skills/telemetry-contract-audit.md`
- Local adapter: `docs/telemetry/telemetry-contract-audit-local-adapter.md`
- Local canonical telemetry docs named by the adapter
- Relevant local traces, analytics events, dashboards, alerts, and telemetry-control surfaces named by the adapter

# Workflow
1. If the shared doc or local adapter has already been referenced in the conversation, reuse that context instead of re-reading. Otherwise read `shared-docs/skills/telemetry-contract-audit.md` for the generic audit method and `docs/telemetry/telemetry-contract-audit-local-adapter.md` for this repo's exact invariants, signals, vendor surfaces, alert groups, and control knobs.
2. Identify which local contract slice is under review: trace summaries, analytics event semantics, cache semantics, finish/outcome semantics, privacy boundaries, alert/dashboard realization, or telemetry-control behavior.
3. Use the adapter to select the exact local signals, surfaces, and canonical invariants that apply to that slice.
4. Compare observed runtime evidence against the local contract before using implementation details to explain the mismatch.
5. Report the narrowest contract failure and stop before drifting into RAG trace review, live incident playbooks, or product interpretation.

# Output format
- Scope reviewed: Langfuse trace contract | PostHog event contract | dashboard/alert realization | config/control layer
- Local invariant or contract slice checked
- Which exact local signals were under review
- Observed evidence
- Result: pass | warning | fail | unverified
- Whether the issue is in: instrumentation emission | canonical semantic contract | vendor realization | privacy/PII policy | runtime-to-telemetry outcome mapping
- Whether the affected scenario is: success | cache hit | retrieval | abort | error
- Primary classification
- Most likely owner layer
- Severity
- Next single action

Required ending:
- `Primary classification:` missing telemetry | semantically incorrect telemetry | contradictory telemetry | unsafe telemetry | unverifiable telemetry
- `Owner layer:` instrumentation | contract/schema semantics | analytics/dashboards | privacy/governance | runtime outcome mapping
- `Severity:` critical | warning | info
- `Next single action:` one concrete follow-up step only

# Common pitfalls
- Do not restate the full generic telemetry audit method here; use the shared doc.
- Do not inline the repo's complete event schema, trace schema, or alert contract here; use the adapter.
- Do not treat a single bad retrieval trace as a telemetry-contract audit by default.
- Do not confuse dashboard symptoms with canonical signal semantics.
- Do not expand into incident triage once the task has moved beyond contract verification.

# References
- Shared reusable method: `shared-docs/skills/telemetry-contract-audit.md`
- Local adapter: `docs/telemetry/telemetry-contract-audit-local-adapter.md`
