# Studio Local LLM Design

## Purpose

Decide, with measurements, whether a model served from a dedicated Mac Studio
can answer JackGPT questions at acceptable quality and speed — and, only if it
can, move the chat app's local-model integration from "a server on the same
laptop" to "an OpenAI-compatible endpoint on another machine".

The existing local integration (Ollama and LM Studio backends, added 2025-12)
assumed the model ran on the developer's own machine and has not been used
since. Its model catalog (Mistral 7B, Llama 3 8B) is two generations old.

## Confirmed Decisions

- **Staged rollout.** Phase A proves quality and speed against a local dev
  server; Phase B (production exposure) is designed in a separate spec and only
  if Phase A passes.
- **Measure before touching app code.** The bake-off calls the model endpoint
  directly with frozen inputs, so it does not depend on the app's provider
  structure. App code changes start only after the bake-off gate passes.
- **One local provider.** The app stops distinguishing Ollama from LM Studio.
  It gains a single `local` provider that speaks the OpenAI-compatible
  `/v1/chat/completions` API; which server software sits behind the URL is
  deployment configuration. Cloud providers (OpenAI, Anthropic, Gemini) keep
  their native SDK clients — they use provider-specific parameters that their
  OpenAI-compatibility layers only partially support.
- **Korean fluency is nice-to-have.** Language match is a reported score, not a
  gate.
- **Unattended overnight runs, in an exclusive window.** Model switching and
  measurement need the GPU to themselves; the window is chosen from the host's
  actual job schedule, not assumed quiet because it is night.

## Non-Goals

- Local embeddings. Retrieval keeps using the cloud embedding spaces; a local
  embedding space would need its own ingestion and index.
- Routing by language (for example, sending Korean questions to a cloud
  model). Revisit only if results show a need.
- Choosing the serving software. That is a joint decision with the other
  consumer of the host (see [Shared Host](#shared-host)) and does not block
  Phase A.
- Mid-stream fallback. Switching to a cloud model after a local stream has
  started is out of scope; availability is decided before the call.

## Current Evidence

**Host.** Mac Studio, Apple M5 Max, 64 GB unified memory, ~750 GB free disk.
An LM Studio server is already running on the default port with an MLX 4-bit
`qwen3-32b` loaded at 32k context. It runs inside a logged-in desktop session,
so it does not survive a reboot without a login.

**Memory budget.** macOS wires roughly 75% of unified memory for the GPU by
default. After KV cache and the host's other resident workloads, the practical
budget for model weights is about 40 GB — or about 20 GB each if two consumers
need different models resident at once.

**Workload.** A JackGPT turn is short: the default RAG context budget is 1,200
tokens and the history budget 900 (`lib/server/settings/guardrail-settings.ts`),
plus the system prompt — roughly 3–5k input tokens and a few hundred output
tokens. Prefill cost is small; perceived speed is time-to-first-token (TTFT)
and decode rate. The system prompt demands strict grounding ("answer ONLY
using information explicitly present in the retrieved context") and a fixed
refusal message, which is where small models most often fail.

**Why MoE.** Decode on Apple Silicon is memory-bandwidth bound: each token
reads the active weights once. A mixture-of-experts model with 3–4B active
parameters decodes several times faster than a dense 27–32B model of similar
memory footprint. MoE models are the speed candidates; a dense model is kept as
the quality ceiling.

**App code facts that shape Phase A3.**

- `localBackendAvailable` (`lib/server/settings/model-settings.ts`) is true
  when the backend is _configured_, not when it is _reachable_. On one machine
  those were nearly the same; with a remote host that can be rebooting, have no
  model loaded, or be off the network, `requireLocal=false` never falls back to
  the cloud — the request fails instead.
- The LM Studio path hard-codes its API key (`llm-provider-factory.ts`) and
  ignores `LMSTUDIO_API_KEY`. The Ollama path passes neither `maxTokens` nor the
  configured timeout.
- Provider identity leaks into telemetry (`llmEngine` is `local-ollama` or
  `local-lmstudio`) and into stored presets (`admin_chat_config` rows may hold
  `mistral-ollama`-style model IDs).

## Candidate Models

Published speed figures for these models are mostly unverified third-party
numbers. Selection uses only what the bake-off measures on this host.

| Model                      | Architecture      | Role                         | Quantizations to test                 |
| -------------------------- | ----------------- | ---------------------------- | ------------------------------------- |
| Qwen3.6-35B-A3B            | MoE, ~3B active   | Speed candidate              | MLX 4-bit; 8-bit if finalist (~37 GB) |
| Gemma 4 26B-A4B            | MoE, ~4B active   | Speed candidate              | MLX 4-bit; 8-bit if finalist          |
| gpt-oss-20b                | MoE, ~3.6B active | Speed candidate              | Native MXFP4 (~13 GB)                 |
| Qwen3.8-27B                | Dense             | Quality ceiling              | MLX 4-bit, thinking disabled          |
| qwen3-32b (already loaded) | Dense             | Previous-generation baseline | MLX 4-bit                             |
| gpt-6-luna                 | Cloud             | Reference answers            | —                                     |

Excluded: Qwen3.8-Flash-Next (does not fit 64 GB even at 4-bit), dense 70B
(fits at Q4 but decodes too slowly for chat), K-EXAONE (far too large).

Reasoning control differs per model: Qwen models disable thinking through a
chat-template argument, gpt-oss accepts a reasoning effort but cannot turn
reasoning off entirely, and servers forward these extra request fields
differently. The bake-off records the exact request fields that work for each
model on the chosen server; Phase A3 copies them into the model catalog.

## Phase A1 — Preparation

**Evaluation set.** 30–40 questions, English-weighted (target ~80/20 EN/KO;
adjust to the production language mix read from Langfuse). Mix: project and
experience questions, out-of-scope questions that must be refused, and a few
multi-turn exchanges. Questions are sourced from production trace inputs.

Real visitor questions **never enter this public repository**. The committed
harness ships with a small hand-written sample; the real set lives in a private
location outside the repo and is referenced by path at run time.

**Frozen inputs.** Every model must receive byte-identical messages, so
retrieval variance does not leak into model comparison. The fixture is
recorded at the wire: run the dev app with its existing LM Studio provider
pointed at a small local recording endpoint that stores each request's
messages and returns a stub completion. This captures exactly what the app
sends — system prompt, retrieved context, history — including the auxiliary
calls (query rewrite, summary), with no app code change. A1 verifies that the
assembled messages do not depend on the selected model ID before relying on
this.

**Harness.** A dependency-free Node script (it runs on the host, which holds no
repo checkout or secrets) that:

1. Records the server's loaded-model state before starting and restores it at
   the end, including on failure.
2. For each model: loads it, warms it up, then runs every fixture item three
   times, streaming, and records TTFT (first _visible_ content token, so
   reasoning tokens count against it), decode tokens/second, total latency,
   output tokens, reasoning tokens where reported, and peak memory.
3. Runs a concurrency pass: fixture requests while two synthetic
   long-generation requests are in flight, to approximate a second consumer.
4. Writes one JSONL row per request and is resumable — a rerun skips completed
   rows.

Models are switched through LM Studio's REST API (`/api/v1/models/load` and
`/unload`), which the host's server exposes. Each variant's thinking-control
candidates are probed once at the start of its run, and the one producing the
least reasoning is used for measurement, so the probe does not need a
separate window.

**Scoring** runs separately on the developer laptop, which holds the API keys:
the cloud reference answers are generated from the same fixture, then a
pinned judge model distinct from every candidate scores each answer on:
groundedness (claims absent from the context are flagged), correctness against
the input, refusal correctness, the project-format rule, and language
match. The developer blind-reviews about ten items, plus every item the judge
flags for groundedness. The gpt-6-luna answers are captured through the running app and graded with
the same rubric and input, which is what the quality ratio compares.

**Logistics.**

- Model downloads (well over 100 GB in total) run the night before the
  bake-off; exact repository IDs and sizes are listed and confirmed before any
  download starts.
- The run window is chosen after reading the host's scheduled job list and
  confirming no other consumer is using the model server in that window.

## Phase A2 — Bake-off

Run the harness overnight in the chosen window. Morning output: a results
table per model and quantization with the metrics above, plus two fit columns —
"fits the 40 GB single-tenant budget" and "fits a 20 GB shared budget" — so the
same table feeds the serving decision.

## Gate

A model passes when all of the following hold on the host (localhost, warm,
single stream, fixture-sized inputs):

| Criterion           | Threshold                                     |
| ------------------- | --------------------------------------------- |
| TTFT                | p50 ≤ 1.5 s, p95 ≤ 3 s                        |
| Decode rate         | p50 ≥ 40 tokens/s                             |
| Groundedness        | zero confirmed ungrounded factual claims      |
| Refusal correctness | ≥ 90% on out-of-scope items                   |
| Overall quality     | mean judge score ≥ 90% of the gpt-6-luna mean |
| Project-format rule | ≥ 90% compliance                              |

Reported but not gating: language match, concurrency degradation, memory fit.

If no model passes, stop after recording the results. No app code changes.

## Phase A3 — Single Local Provider

Only after the gate passes.

- **Provider.** Replace `ollama` and `lmstudio` in `ModelProvider` with `local`.
  `createChatModel` builds a `ChatOpenAI` against the configured base URL with
  the configured API key, honoring `maxTokens` and timeout.
- **Configuration.** `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY`,
  `LOCAL_LLM_TIMEOUT_MS`, and `LOCAL_LLM_ENABLE_IN_PROD` (keeps the existing
  production-off default) replace the per-server variables and the
  `LOCAL_LLM_BACKEND` switch. Any backend-override header or query parameter is
  removed.
- **Catalog.** Local entries in `lib/shared/models.ts` carry the server-side
  model ID, whether sampling parameters are accepted, and the extra request
  fields measured in A2 (for example, how thinking is disabled). The old
  Mistral and Llama 3 entries are removed.
- **Health probe.** Availability comes from a probe, not configuration: a
  one-token completion against the selected model with a short timeout, cached
  per server instance (longer TTL on success, shorter on failure, single-flight
  so concurrent requests share one probe). A probe that is slow because the
  server is loading the model on demand counts as unavailable. The result feeds
  the existing `requireLocal` enforcement unchanged: `requireLocal=true` returns
  the existing 503 `local_required_unavailable`; `requireLocal=false` falls back
  to the default cloud model and records `fallbackFrom`.
- **Telemetry.** `llmEngine` becomes `local`, with the model ID alongside;
  `fallbackFrom` follows. Update the telemetry contract docs and any
  analytics-as-code query keyed on the old values in the same change.
- **Stored presets.** Model IDs are data in `admin_chat_config`. Old local IDs
  must resolve explicitly to "unknown local model", which is treated as
  unavailable and handled by `requireLocal` — never silently to a different
  model. Presets are changed through the admin dashboard, since editing code
  defaults does not change a preset the database row already defines.
- **Removal.** Delete the per-server modules (`lib/core/ollama.ts`,
  `lib/core/lmstudio.ts`, the custom `lib/local-llm` clients, the LangChain
  Ollama wrapper, and Ollama-specific error types) after confirming each has no
  remaining caller.
- **Docs and UI.** Rewrite `docs/operations/local-llm-operations-checklist.md`;
  update `.env.example`, provider labels in the admin chat-config cards, and the
  chat API smoke skill's local-preset instructions.

**Tests.** Unit tests for: the provider factory's `local` branch (base URL, key,
token limit, extra request fields); probe caching, TTLs, single-flight, and
timeout classification; availability and enforcement in `model-settings` for
reachable, unreachable, and unknown-model cases; old-ID resolution.

## Phase A4 — Dev End-to-End

The laptop's dev server points `LOCAL_LLM_BASE_URL` at the host over the
private network (the address lives in local env, never in the repo).

1. `pnpm smoke:chat` with a local-model preset: healthy SSE stream, the
   Langfuse trace shows `llmEngine=local`, and auxiliary calls (rewrite, HyDE,
   summary) also go to the local model.
2. Failure drills, each with `requireLocal` true and false: model unloaded,
   server stopped, host unreachable. Expected: 503 `local_required_unavailable`,
   or cloud fallback with `fallbackFrom=local`.
3. Network overhead: TTFT from the laptop compared with the A2 localhost
   figure for the same model.
4. A human session of real questions in the dev chat UI.

## Shared Host

The host also serves a second internal consumer, a product-management
automation service, whose use of the model server is not yet settled. That
makes the serving software a shared decision, taken in parallel with A3–A4 and
finalized before Phase B. Criteria:

- Runs as a service that starts at boot without a desktop login.
- Can keep two models resident, or both consumers agree on one model.
- Handles concurrent requests from two consumers acceptably (the A2
  concurrency pass informs this).
- Supports API-key authentication, which Phase B's remote exposure needs.
- Server-level settings that the app can no longer set per request (context
  length, keep-alive) are owned in one place for both consumers.

Because the app only assumes the OpenAI-compatible API, changing the serving
software after A4 is a configuration change for this app.

## Phase B — Production Exposure (Separate Spec)

Designed after A4 and the serving decision. It must cover: the tunnel and its
authentication, restricting local routing to chosen presets, availability when
the host is down, and TTFT measured from the production runtime to the host.

## Risks

- **Contention with the host's primary workloads.** A large model's memory can
  squeeze the host's scheduled jobs; the memory-fit columns and the shared
  budget exist to catch this.
- **Desktop-session server.** Until the serving decision lands, a host reboot
  leaves the model server down; the health probe turns that into a fallback
  rather than an error.
- **Per-server request-field handling.** Extra fields that disable thinking may
  be ignored by a different server. The catalog records fields per model, and a
  serving-software change repeats the A2 smoke subset.
- **Judge bias.** An LLM judge can favor answers that resemble its own style;
  blind human review of flagged and sampled items is the check.
