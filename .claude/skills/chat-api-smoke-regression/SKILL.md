---
name: chat-api-smoke-regression
description: Use this skill when the user says things like "/api/chat not working", "run the smoke test", "check the chat endpoint", "verify streaming", "why is `/api/langchain_chat` failing", "Safe Mode smoke", "local-required preset check", or "cache-hit header missing" and the task is to run or interpret this repository's repeatable smoke checks for the chat API entrypoints. Use it especially after backend, guardrail, cache, telemetry, Safe Mode, local-LLM, or debug-surface changes. Do NOT use it for deep root-cause analysis of RAG quality, citations missing, retrieval issues, Langfuse trace review, telemetry-contract review, or broad incident response once the smoke failure is already understood.
---

# When to use

- Use this wrapper to bind the canonical chat API smoke skill to this repo.
- Use it when the task is to validate endpoint reachability, streaming, repeat-request cache signaling, or degraded-mode behavior on the chat API surfaces.
- Do not use it for retrieval-quality diagnosis, telemetry taxonomy review, ingestion verification, or general debugging after the failing stage is already clear.

# Goals

- Confirm that the target chat API smoke entrypoints still respond.
- Confirm that expected streaming behavior is still observable where applicable.
- Confirm that repeat-request cache signaling still behaves as expected for the local repo.
- Confirm that degraded or fallback smoke scenarios still return a response.
- Localize the narrowest failing smoke stage before deeper debugging starts.

# Method

## API Smoke Patterns

### Purpose

Use this method to run or interpret repeatable API smoke checks. The objective
is to localize the first failing stage quickly, not to complete full root-cause
analysis.

### Review Steps

1. Identify the scenario under test from the adapter:
   - baseline reachability
   - response content validation
   - streaming validation
   - repeat-request cache validation
   - degraded or fallback validation
2. Use the adapter to choose the correct endpoint, script, flags, and expected
   headers or response markers.
3. Execute the narrowest smoke scenario that answers the user request.
4. Record observable results only:
   - status code or transport failure
   - whether content returned
   - whether streaming occurred when expected
   - whether cache indicators behaved as expected
   - whether degraded-mode behavior still returned a valid response
5. Stop once the failing stage is localized.

### Output Expectations

- State the endpoint and command used.
- Report PASS, FAIL, or UNVERIFIED per scenario.
- Name the first failing stage.
- End with one concrete next action.

### Boundaries

- Do not treat smoke success as proof that quality, telemetry, or retrieval are
  correct.
- Do not drift into deep debugging once the failing stage is known.
- Do not assume every validation signal applies to every endpoint.

# Workflow

1. If the canonical playbook or local adapter has already been referenced in the conversation, reuse that context instead of re-reading.
2. Read the canonical playbook for the generic smoke method and the local adapter for repo-specific entrypoints, commands, validation signals, and exclusions.
3. Identify which local smoke scenario the user is asking about: current endpoint, legacy endpoint, repeat-request cache validation, or degraded-mode and fallback validation.
4. Use the adapter to select the correct local script, request path, flags, and expected validation signals for the scenario.
5. Run or interpret the smoke check and classify the result by stage: reachability, output or content, streaming, cache validation, or degraded-mode behavior.
6. Stop at smoke failure localization. If the issue is clearly a retrieval-quality, telemetry-contract, or broader incident problem, hand off to the appropriate skill instead of expanding scope.

# Output format

- Endpoint tested
- Script or command used
- Scenario executed
- Smoke result per scenario: PASS, FAIL, or UNVERIFIED where the local adapter explicitly allows it
- Key local observables: endpoint response, streaming status, cache signal status, degraded-mode result
- Whether smoke headers were expected and observed
- Whether degraded-mode or local-required preset coverage was included
- Whether debug-surface expectations were part of the run
- Failing stage
- Primary classification
- Most likely owner layer
- Next single action

Required ending:
- `Primary classification:` endpoint/config failure | output/content failure | streaming failure | cache validation failure | degraded-mode failure
- `Owning layer:` API | transport/streaming | caching | runtime/config | fallback/degraded-mode
- `Failing stage:` baseline request | output validation | streaming validation | repeat-request cache validation | degraded-mode validation
- `Next single action:` one concrete follow-up step only

# Common pitfalls

- Do not re-teach the generic smoke method inside this skill; use the canonical playbook.
- Do not inline the repo's full command matrix or header matrix here; use the local adapter.
- Do not treat smoke success as proof that retrieval, telemetry, or prompt behavior is correct.
- Do not drift into deep root-cause analysis after the failing stage is clear.
- Do not assume every smoke request path or validation signal applies to every local scenario.

# Local context

Repo-specific vocabulary, vendor surfaces, invariants, and control knobs live in
[`docs/testing/api-smoke-patterns-local-adapter.md`](../../../docs/testing/api-smoke-patterns-local-adapter.md). Read it before applying the method above.

# Local overrides

- Default current-path target is `/api/chat`; use the legacy endpoint only when the adapter says legacy or debug-surface coverage is part of the requested smoke scope.
- Stop at smoke failure localization and hand off deeper retrieval or telemetry analysis to the corresponding skill.
