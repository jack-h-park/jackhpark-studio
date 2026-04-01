---
name: telemetry-contract-audit
description: Use this skill when the user says things like "telemetry looks wrong", "Langfuse trace looks wrong", "PostHog inconsistency", "event fields changed", "field semantics drifted", "finish reason is wrong", "cache semantics look off", "PII boundary check", "sampling/detail issue", "telemetry contract drift", or "dashboards don't match reality" and the task is to verify that this repository's telemetry still obeys its documented signal contract. Use it for contract-level review of field semantics, summaries, cache truthfulness, finish/outcome semantics, privacy boundaries, and telemetry-control behavior. Do NOT use it for diagnosing a single RAG retrieval issue, reviewing citation quality in one trace, running live incident triage after the alert is already understood, or doing broad product interpretation.
---

# When to use
- Use this wrapper to bind the canonical telemetry-contract skill to this repo.
- Use it when the question is semantic correctness, contract drift, missing summaries, cache truthfulness, finish/outcome classification, privacy boundaries, or telemetry-control behavior.
- Do not use it for single-trace retrieval diagnosis, on-call incident response, or general debugging once the telemetry contract violation is no longer the main question.

# Canonical bindings
- Canonical skill: `jackhpark-ai-skills/skills/dev/telemetry-contract-audit/SKILL.md`
- Local adapter: `docs/telemetry/telemetry-contract-audit-local-adapter.md`

# Workflow
1. Read the canonical skill.
2. Read the local adapter.
3. Apply the canonical workflow using this repo's telemetry invariants, vendor surfaces, and control knobs.
4. Keep the canonical output contract unless a local override below says otherwise.

# Local overrides
- Default vendor surfaces in this repo are Langfuse traces and PostHog analytics events.
- Stop at contract failure localization and hand off single-trace retrieval issues to the retrieval-trace skill instead of expanding scope.
