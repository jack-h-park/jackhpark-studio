# Batched Load Prevention Design

## Intent and approval

The owner approved optional RAG-pass cancellation, bounded same-run Notion fetch reuse, and isolation of the external publisher test suite from production on October 22, 2026. PR #240 remains a draft. Merge, deployment, paid-tier changes, and monitoring-cadence changes remain prohibited without separate approval.

## Evidence and limits

- PR #240 contains the earlier API/cache/OG changes at `819c079`; they are not deployed.
- The latest READY production revision observed during the investigation was `dee80e2`.
- The signed-in dashboard showed 4h 34m Active CPU over the displayed last-30-day window. In the sampled last 12 hours, Production showed approximately 1m for dynamic Notion pages, 28s for the chat page, 16s for OG images, 15s for ingestion, and 520ms for the chat API. These are rounded observations, not a historical attribution model.
- An external publisher test passed while attempting a refresh of fixture page `page-123`. All network traffic was intercepted during reproduction. Production logs and the operations test-run receipt corroborated the same request shape and timing.
- Availability checks are independent of human traffic. Their exact CPU share has not been measured. Their cadence is not changed here.

## Approach

Use request-local cancellation and run-local reuse rather than extending timeouts or introducing a persistent cross-run cache. Timeout extensions retain unwanted work; cross-run caching risks stale ingestion and requires invalidation beyond this scope. Preserve the existing base-answer fallback and ingestion lifecycle.

### Optional RAG pass

- Keep the existing 2,000ms optional-pass deadline, reduced to 1,200ms when multi-query shares the budget.
- Give the optional pass a child AbortController linked to the request signal. Its timeout must abort only that pass, never the request or the already-completed base result.
- Propagate cancellation to supported LLM calls and check it around awaited embedding/vector/metadata/ranking stages so no later stage begins after cancellation.
- Do not swallow aborts as ordinary rewrite/HyDE fallback failures. Preserve existing fallback behavior for genuine non-abort provider errors.
- Some interfaces do not support aborting an already-issued remote call. Do not claim to revoke completed work or all provider charges; enforce no-new-work boundaries and propagate supported cancellation.
- Clear deadline timers and parent listeners after every outcome. Observe late rejection without unhandled rejections. Preserve timeout/error telemetry classification and base-result selection.

### Same-run ingestion reuse

- Create one cache per manual ingestion run, never module-global. Retain only successful, nonempty discovery responses.
- Bound retained UTF-8 JSON snapshots to 8 MiB total, 32 entries, and 1 MiB per entry. These are payload limits, not process RSS limits. FIFO eviction is sufficient because candidates are consumed once.
- Consume and delete a retained response when its page is processed; otherwise use the existing fetch/retry path. Clear leftovers on success, failure, or early termination.
- Keep discovery's existing two-argument callers compatible through an optional successful-page callback.
- Do not change traversal caps, content hashing, embedding policy, lifecycle attempt/failure accounting, or deletion/sweep completeness gates. Database-row leaves and failed/oversized/evicted discovery responses still fetch normally.

### External publisher test isolation

- Remove inherited `CRON_SECRET` and `RAG_INGEST_URL` in the external repository's root autouse test fixture. Tests needing synthetic values must set them explicitly after fixture setup.
- Keep real publisher behavior unchanged; explicit credential-bearing transport tests continue to use mocked HTTP boundaries.
- Prove the guard with a child pytest process inheriting synthetic credentials and a network interceptor. Never reproduce against the real endpoint.
- Preserve unrelated dirty files and use a separately isolated checkout for that repository. No fleet installation, cron activation, or remote mutation is authorized.

### CodeQL boundary

Add an explicit scalar-string check before the Notion route validator and resolver. The existing runtime rejection behavior stays unchanged. The two failing CodeQL parameter-tampering annotations are the pre-existing failing verification signal; do not replace them with a source-text assertion.

## Acceptance

Each change has its own behavioral regression evidence and commit. The Studio suite, typecheck, lint, formatting, CI fixture build, and independent review must pass. Run the external repository's documented full test command in a safe isolated environment and report all failures, including unrelated ones. Keep PRs draft and report local verification separately from merge, deployment, and measured production savings.
