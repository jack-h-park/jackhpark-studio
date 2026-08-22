---
name: telemetry-contract-audit
description: Use this skill when the user says things like "telemetry looks wrong", "Langfuse trace looks wrong", "PostHog inconsistency", "event fields changed", "field semantics drifted", "finish reason is wrong", "cache semantics look off", "PII boundary check", "sampling/detail issue", "telemetry contract drift", or "dashboards don't match reality" and the task is to verify that this repository's telemetry still obeys its documented signal contract. Use it for contract-level review of field semantics, summaries, cache truthfulness, finish/outcome semantics, privacy boundaries, and telemetry-control behavior. Do NOT use it for diagnosing a single RAG retrieval issue, reviewing citation quality in one trace, running live incident triage after the alert is already understood, or doing broad product interpretation.
---

# When to use

- Use this wrapper to bind the canonical telemetry-contract skill to this repo.
- Use it when the question is semantic correctness, contract drift, missing summaries, cache truthfulness, finish/outcome classification, privacy boundaries, or telemetry-control behavior.
- Do not use it for single-trace retrieval diagnosis, on-call incident response, or general debugging once the telemetry contract violation is no longer the main question.

# Goals

- Verify that the local telemetry contract still matches emitted runtime evidence.
- Verify that traces, analytics events, and summary outputs stay semantically consistent.
- Verify that privacy and detail-level controls still enforce the intended local policy.
- Classify the narrowest telemetry contract failure and identify the smallest owner layer that must change.

# Method

## Telemetry Contract Audit

### Purpose

Use this method to verify that emitted telemetry still truthfully represents
runtime behavior. The focus is contract correctness, not general debugging.

Use the companion playbook `telemetry-operational-verification.md` when the
task is a scenario-by-scenario verification pass rather than a semantic
contract audit.

### Review Steps

1. Identify the contract slice under review using the adapter:
   - trace summaries
   - analytics event semantics
   - cache semantics
   - finish or outcome semantics
   - privacy or PII boundaries
   - dashboard or alert realization
   - telemetry-control behavior
2. Gather observed runtime evidence and the corresponding documented invariant.
3. Compare observed evidence to the contract before reading implementation code
   for explanation.
4. Classify the narrowest failure:
   - missing telemetry
   - semantically incorrect telemetry
   - contradictory telemetry
   - unsafe telemetry
   - unverifiable telemetry
5. Map the issue to the smallest owner layer and stop.

### Output Expectations

- Name the contract slice reviewed.
- State the exact signals checked.
- Report observed evidence and result.
- Classify the issue and owner layer.
- End with one concrete next action.

### Boundaries

- Do not treat one bad retrieval trace as a telemetry-contract audit by default.
- Do not confuse dashboard symptoms with the canonical contract.
- Do not expand into incident response once contract verification is complete.

# Workflow

1. If the canonical playbook or local adapter has already been referenced in the conversation, reuse that context instead of re-reading.
2. Read the canonical playbook for the generic audit method and the local adapter for repo-specific invariants, signals, vendor surfaces, alert groups, and control knobs.
3. Identify which local contract slice is under review: trace summaries, analytics event semantics, cache semantics, finish or outcome semantics, privacy boundaries, alert and dashboard realization, or telemetry-control behavior.
4. Use the adapter to select the exact local signals, surfaces, and canonical invariants that apply to that slice.
5. Compare observed runtime evidence against the local contract before using implementation details to explain the mismatch.
6. Report the narrowest contract failure and stop before drifting into retrieval trace review, live incident playbooks, or product interpretation.

# Output format

- Scope reviewed
- Local invariant or contract slice checked
- Exact local signals reviewed
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

- Do not restate the full telemetry audit method here; use the canonical playbook.
- Do not inline the repo's complete event schema, trace schema, or alert contract here; use the local adapter.
- Do not treat a single bad retrieval trace as a telemetry-contract audit by default.
- Do not confuse dashboard symptoms with canonical signal semantics.
- Do not expand into incident triage once the task has moved beyond contract verification.

# Local context

Repo-specific vocabulary, vendor surfaces, invariants, and control knobs live in
[`docs/telemetry/telemetry-contract-audit-local-adapter.md`](../../../docs/telemetry/telemetry-contract-audit-local-adapter.md). Read it before applying the method above.

# Local overrides

- Default vendor surfaces in this repo are Langfuse traces and PostHog analytics events.
- Stop at contract failure localization and hand off single-trace retrieval issues to the retrieval-trace skill instead of expanding scope.
