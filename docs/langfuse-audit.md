<!--
- [x] A. Sampling/no-op behavior is now controlled by `decideTelemetryMode` before any Langfuse work; traces/spans/snapshots/prompts are only built when `shouldEmitTrace` is true, and `sampleRate=0`/`1` behave as expected.
- [x] B. Detail-level gating keeps `minimal` traces tiny (no config snapshot or retrieval spans), `standard` attaches the snapshot without verbose spans, and `verbose` adds retrieval spans whose per-chunk payloads are capped and sanitized.
- [x] C. `computeBasePromptVersion` and `buildChatConfigSnapshot` run only when `shouldEmitTrace && includeConfigSnapshot`, avoiding expensive work for sampled-out/minimal requests.
- [x] D. Tags are limited to the normalized `env`, `preset`, and `guardrail` values via `buildLangfuseTags`, with `preview` mapped to `dev`.
- [x] E. Cache telemetry now mirrors TTL usage (values stay `null` when disabled and only attached alongside the config snapshot) and uses boolean flags for hits/misses.
- [x] F. Minimal traces omit `input`, while higher detail levels keep it; retrieval/reranker spans only log sanitized, limited entries so chunk text/PII never reach Langfuse.
- [x] G. Langfuse errors remain non-fatal and do not block responses; the client’s ingestion guard continues to disable gracefully.
- [x] H. Native and LangChain handlers now share the same telemetry gating/tags and emit at most one trace per request.
-->

# Langfuse Audit Summary

- Telemetry decisions now gate expensive work, keep minimal traces lean, and ensure verbose spans stay bounded thanks to the shared `buildRetrievalTelemetryEntries` helper.
- Tags are constrained to the environment, preset, and guardrail route; minimal mode omits the user input entirely while standard/verbose include it.
- Cache telemetry is only attached when tracing is enabled and detail level allows it, with hits/misses reflecting TTL usage.
- To run the Langfuse telemetry unit checks locally, use `pnpm test:unit` (or `node --import tsx --test test/chat-langfuse.test.ts` for a single file); the script now scans the `test/` directory with `find`.
