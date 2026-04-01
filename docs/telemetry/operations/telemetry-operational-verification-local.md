# Telemetry Operational Verification Local Supplement

This document is the repo-local supplement to the canonical operational verification playbook `jackhpark-ai-skills/playbooks/telemetry-operational-verification.md`.

Use the canonical playbook for the reusable verification flow. Use this local supplement only for exact field names, observation names, and first-pass ownership hints inside `nextjs-react-notion-x`.

## Exact Local Signals

- Response cache hit:
  - `metadata.cache.responseHit`
  - `output.cache_hit`
- Retrieval cache hit:
  - `metadata.cache.retrievalHit`
- Retrieval attempted:
  - `metadata.rag.retrieval_attempted`
- Finish reason:
  - `output.finish_reason`
- Insufficient:
  - `output.insufficient`
- Citation count:
  - `output.citationsCount`

## Exact Local Observations

- `answer:llm`
- `rag:root`
- `context:selection`
- `rag_retrieval_stage`

## Repo-Specific Verification Notes

- Langfuse is the first local surface for per-request verification.
- PostHog is the first local surface for aggregate event semantics and alert realization.
- The main knowledge-traffic proxy in PostHog is `rag_enabled=true`.
- Default PII-safe behavior means raw question text must not appear unless `LANGFUSE_INCLUDE_PII="true"`.

## First-Pass Ownership Hints

| Symptom | First place to inspect |
| --- | --- |
| `insufficient` spikes on cache hits | `lib/server/api/langchain_chat_impl_heavy.ts` |
| `retrieval_attempted=true` on non-retrieval requests | `lib/server/langchain/ragRetrievalChain.ts` |
| Missing output summary | `lib/server/api/langchain_chat_impl_heavy.ts` |
| Cache flags flipping | `lib/server/api/langchain_chat_impl_heavy.ts` |

## Related Local Docs

- [docs/telemetry/langfuse-guide.md](../langfuse-guide.md)
- [docs/telemetry/implementation/telemetry-logging.md](../implementation/telemetry-logging.md)
- [docs/telemetry/posthog-ops.md](../posthog-ops.md)
