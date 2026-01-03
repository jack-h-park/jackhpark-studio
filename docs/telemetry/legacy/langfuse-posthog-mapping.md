# Langfuse → PostHog event mapping (archived)

Signal mapping now lives inside `docs/telemetry/alerting-contract.md`, which covers both the alert contract and the canonical PostHog events/properties that Step 3 consumes. The key `chat_completion` properties that PostHog relies on are:

| Property | Type | Notes |
| --- | --- | --- |
| `latency_ms` | number (ms) | Handler entry → completion latency used by Alert A and cache parity diagnostics. |
| `response_cache_hit` | boolean | `true` when a response cache snapshot satisfies the request without rerunning the LLM. |
| `retrieval_cache_hit` | boolean | `true` when retrieval cache satisfies the request and prevents the retrieval chain from rerunning. |
| `response_cache_enabled` | boolean | Indicates response cache capability regardless of hit status. |
| `retrieval_cache_enabled` | boolean | Indicates retrieval cache capability regardless of hit status. |

Legacy Langfuse-only metadata fields are not consumed by PostHog alerts—stick to the canonical boolean props in `alerting-contract.md`.
