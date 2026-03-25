---
name: chat-api-smoke-regression
description: Use this skill when the user says things like "/api/chat not working", "run the smoke test", "check the chat endpoint", "verify streaming", "why is `/api/langchain_chat` failing", "Safe Mode smoke", "local-required preset check", or "cache-hit header missing" and the task is to run or interpret this repository's repeatable smoke checks for the chat API entrypoints. Use it especially after backend, guardrail, cache, telemetry, Safe Mode, local-LLM, or debug-surface changes. Do NOT use it for deep root-cause analysis of RAG quality, citations missing, retrieval issues, Langfuse trace review, telemetry-contract review, or broad incident response once the smoke failure is already understood.
---

# When to use
- Use this skill to execute or interpret the repo's local chat API smoke workflow.
- Use it when the task is to validate endpoint reachability, streaming, repeat-request cache signaling, or degraded-mode behavior on the chat API surfaces.
- Do not use it for retrieval-quality diagnosis, telemetry taxonomy review, ingestion verification, or general debugging after the failing stage is already clear.

# Goals
- Confirm that the local chat API smoke entrypoints still respond.
- Confirm that expected streaming behavior is still observable where applicable.
- Confirm that repeat-request cache signaling still behaves as expected for this repo.
- Confirm that local degraded or fallback smoke scenarios still return a response.
- Localize the narrowest failing smoke stage before deeper debugging starts.

# Inputs to inspect
- Shared method: `shared-docs/skills/api-smoke-patterns.md`
- Local adapter: `docs/testing/api-smoke-patterns-local-adapter.md`
- Local smoke docs:
  - `docs/testing/api-smoke-chat.md`
  - `docs/testing/api-smoke-test-summary.md`
- Local smoke scripts and commands called out by the adapter
- Local flags, headers, and degraded-mode switches called out by the adapter

# Workflow
1. If the shared doc or local adapter has already been referenced in the conversation, reuse that context instead of re-reading. Otherwise read `shared-docs/skills/api-smoke-patterns.md` for the generic smoke method and `docs/testing/api-smoke-patterns-local-adapter.md` for this repo's entrypoints, commands, validation signals, and exclusions.
2. Identify which local smoke scenario the user is asking about: primary chat endpoint, legacy chat endpoint, repeat-request cache validation, or degraded-mode/fallback validation.
3. Use the adapter to select the correct local script, request path, flags, and expected validation signals for the scenario.
4. Run or interpret the smoke check and classify the result by stage: reachability, output/content, streaming, cache validation, or degraded-mode behavior.
5. Stop at smoke failure localization. If the issue is clearly a retrieval-quality, telemetry-contract, or broader incident problem, hand off to the appropriate skill instead of expanding scope.

# Output format
- Which endpoint was tested: unified (`/api/chat`) or legacy (`/api/langchain_chat`)
- Which script or command was used
- Scenario executed
- Smoke result per scenario: PASS, FAIL, or UNVERIFIED where the local adapter explicitly allows it
- Key local observables: endpoint response, streaming status, cache signal status, degraded-mode result
- Whether smoke headers were expected and observed
- Whether Safe Mode or local-required preset coverage was included
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
- Do not re-teach the generic smoke method inside this skill; use the shared doc.
- Do not inline the repo's full command matrix or header matrix here; use the adapter.
- Do not treat smoke success as proof that retrieval, telemetry, or prompt behavior is correct.
- Do not drift into deep root-cause analysis after the failing stage is clear.
- Do not assume every smoke request path or validation signal applies to every local scenario.

# References
- Shared reusable method: `shared-docs/skills/api-smoke-patterns.md`
- Local adapter: `docs/testing/api-smoke-patterns-local-adapter.md`
