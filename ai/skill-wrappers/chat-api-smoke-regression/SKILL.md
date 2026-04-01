---
name: chat-api-smoke-regression
description: Use this skill when the user says things like "/api/chat not working", "run the smoke test", "check the chat endpoint", "verify streaming", "why is `/api/langchain_chat` failing", "Safe Mode smoke", "local-required preset check", or "cache-hit header missing" and the task is to run or interpret this repository's repeatable smoke checks for the chat API entrypoints. Use it especially after backend, guardrail, cache, telemetry, Safe Mode, local-LLM, or debug-surface changes. Do NOT use it for deep root-cause analysis of RAG quality, citations missing, retrieval issues, Langfuse trace review, telemetry-contract review, or broad incident response once the smoke failure is already understood.
---

# When to use
- Use this wrapper to bind the canonical chat API smoke skill to this repo.
- Use it when the task is to validate endpoint reachability, streaming, repeat-request cache signaling, or degraded-mode behavior on the chat API surfaces.
- Do not use it for retrieval-quality diagnosis, telemetry taxonomy review, ingestion verification, or general debugging after the failing stage is already clear.

# Canonical bindings
- Canonical skill: `jackhpark-ai-skills/skills/dev/chat-api-smoke-regression/SKILL.md`
- Local adapter: `docs/testing/api-smoke-patterns-local-adapter.md`

# Workflow
1. Read the canonical skill.
2. Read the local adapter.
3. Apply the canonical workflow using this repo's smoke commands, validation headers, and degraded-mode switches.
4. Keep the canonical output contract unless a local override below says otherwise.

# Local overrides
- Default current-path target is `/api/chat`; use the legacy endpoint only when the adapter says legacy or debug-surface coverage is part of the requested smoke scope.
- Stop at smoke failure localization and hand off deeper retrieval or telemetry analysis to the corresponding skill.
