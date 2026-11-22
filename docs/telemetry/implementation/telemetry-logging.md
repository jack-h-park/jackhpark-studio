# Logging & Telemetry Architecture

> **Derives from canonical:** [Telemetry alerting contract](../alerting-contract.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

This document explains how we configure **logging** and **Langfuse telemetry** across both the **Native** and **LangChain** chat engines.  
It assumes the signal definitions and alert contracts documented in `alerting-contract.md` so it can focus on implementation plumbing.

## Overview

- **Database (Admin configuration)** is the main source of truth for telemetry:
  - `telemetry.sampleRate`
  - `telemetry.detailLevel` (`"minimal" | "standard" | "verbose"`)
- **Environment variables** are treated as policy knobs:
  - `TELEMETRY_ENABLED` acts as a global kill switch.
  - `TELEMETRY_SAMPLE_RATE_DEFAULT` / `TELEMETRY_DETAIL_DEFAULT` provide sensible defaults when the database value is missing.
  - `TELEMETRY_SAMPLE_RATE_MAX` / `TELEMETRY_DETAIL_MAX` cap the maximum detail and sample rate.
  - `TELEMETRY_DETAIL_OVERRIDE` / `TELEMETRY_SAMPLE_RATE_OVERRIDE` are allowed only in non-production and are meant for temporary debugging.

## Codebase Structure

The logging and telemetry implementation is split into two main directories:

### Core Logging (`lib/logging/`)

- `logger.ts`: Main entry point for domain loggers (`ragLogger`, `llmLogger`, etc.) and server-side log emission.
- `config.ts`: Consolidates environment variables and database settings into a unified `LoggingConfig`.
- `client.ts`: Lightweight logging helper for client-side components (e.g., Notion renderer).
- `types.ts`: Shared TypeScript interfaces for levels, domains, and configuration.

### Telemetry Helpers (`lib/telemetry/`)

- `chat-langfuse.ts`: Logic for sampling decisions and determining trace detail levels.
- `langfuse-tags.ts`: Standardizes how traces are tagged (env, preset, guardrail).
- `prompt-version.ts`: Generates the SHA256 version hash for system prompts.

All engines consume telemetry via `getLoggingConfig().telemetry` and never read the telemetry env vars directly.

## Environments & Priority Rules

`buildLoggingConfig()` normalizes the runtime to one of:

- `local`
- `preview`
- `production`

This value determines how overrides and max bounds are treated.

### Priority order

1. **Kill switch:** `TELEMETRY_ENABLED=false` forces `telemetry.enabled=false`.
2. **Admin DB config:** `adminConfig.telemetry.sampleRate` and `.detailLevel`.
3. **Defaults (ENV):** `TELEMETRY_SAMPLE_RATE_DEFAULT` (default `1`) and `TELEMETRY_DETAIL_DEFAULT` (`standard`, or `verbose` for local).
4. **Overrides (non-production only):** `TELEMETRY_DETAIL_OVERRIDE`, `TELEMETRY_SAMPLE_RATE_OVERRIDE`.
5. **Max bounds:** `TELEMETRY_SAMPLE_RATE_MAX` (default `1`) and `TELEMETRY_DETAIL_MAX`.
   - In production we typically clamp `TELEMETRY_DETAIL_MAX` to `standard`.
   - In non-production it can safely be `verbose`.

Detail levels follow the ordering: `minimal < standard < verbose`.

## Telemetry Merge Rules

`buildLoggingConfig()` merges the sources as follows:

1. Load DB values (may be `null`/`undefined`).
2. Apply ENV defaults when the DB value is missing.
3. If the environment is not `production`, apply overrides.
4. Clamp the detail/sample rate to the `_MAX` bounds.
5. Apply the kill switch (`TELEMETRY_ENABLED=false` or `sampleRate <= 0` → `enabled=false`).

```ts
interface TelemetryConfig {
  enabled: boolean;
  sampleRate: number;
  detailLevel: TelemetryDetailLevel; // "minimal" | "standard" | "verbose"
}

interface LoggingConfig {
  env: "local" | "preview" | "production";
  globalLevel: LogLevel;
  rag: DomainLoggingConfig;
  ingestion: DomainLoggingConfig;
  notion: DomainLoggingConfig;
  externalLLM: DomainLoggingConfig;
  telemetryLog: DomainLoggingConfig;
  telemetry: TelemetryConfig;
}
```

## Engine Usage

Both Native and LangChain engines follow the same pattern:

```ts
import { getLoggingConfig } from "@/lib/logging/logger";
import { decideTelemetryMode } from "@/lib/telemetry/chat-langfuse";

const loggingConfig = await getLoggingConfig();
const { enabled, sampleRate, detailLevel } = loggingConfig.telemetry;

const telemetryDecision = decideTelemetryMode(
  enabled ? sampleRate : 0,
  detailLevel,
  Math.random,
  forceEmitTrace ?? false,
);

if (!telemetryDecision.shouldEmitTrace) {
  // Skip creating a Langfuse trace.
} else {
  // Attach metadata based on includeConfigSnapshot / includeRetrievalDetails.
}
```

`Telemetered` detail levels:

- `minimal`: emit the trace only.
- `standard`: include the config snapshot metadata.
- `verbose`: additionally include retrieval spans (e.g., `logRetrievalStage()` entries).

## Console Logging vs Telemetry

It is important to distinguish between **Console Logging** (for local development and server monitoring) and **Telemetry** (for structured tracing and long-term analysis):

- **Telemetry**: Controlled by `loggingConfig.telemetry`. These are rich traces and observations sent to **Langfuse**. Access is limited by sampling and detail levels.
- **Console Logging**: Controlled by domain loggers. These are standard text logs printed to the terminal (stdout/stderr).

Domain loggers read their level from `LoggingConfig` and replace ad-hoc `console.log` calls. They enable consistent filtering per subsystem:

```ts
await ragLogger.debug("resolved retrieval candidates", { urls });
```

### Console Logging Domains

Each subsystem has a dedicated domain logger. You can control their verbosity independently via environment variables:

- `LOG_GLOBAL_LEVEL`: The default log level for all domains if a specific override is not provided.
- `LOG_RAG_LEVEL`: Logs the entire RAG pipeline, including guardrail routing, retrieval results, weighting, and ranking logic.
- `LOG_INGESTION_LEVEL`: Logs background ingestion tasks, content processing, and database updates.
- `LOG_NOTION_LEVEL`: Logs Notion-specific logic, such as page fetching and component rendering (available on both client and server).
- `LOG_LLM_LEVEL`: Logs external API calls to LLM providers. At `trace` level, it includes raw streaming chunks and precise timing metrics.
- `LOG_TELEMETRY_LEVEL`: Diagnostic logs for the telemetry system itself (e.g., Langfuse connection status, sampling decisions).
- `LOG_DB_LEVEL`: Logs database-adjacent operations (Supabase queries, ingestion runners, admin snapshots) without including full row payloads.

Avoid legacy `DEBUG_*` env vars; they are deprecated and are no longer effective (some may trigger warnings). Use the unified config instead.

### Replacing legacy `DEBUG_*` flags

| Legacy flag(s)                                                                        | Replacement                                    | Notes                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DEBUG_RAG_STEPS`, `DEBUG_RAG_URLS`, `DEBUG_RAG_MSGS`                                 | `LOG_RAG_LEVEL=debug` or `trace`               | Enables guardrail, retrieval, and prompt logs across both engines.                 |
| `DEBUG_LANGCHAIN_STREAM`, `NEXT_PUBLIC_DEBUG_LANGCHAIN_STREAM`, `DEBUG_OLLAMA_TIMING` | `LOG_LLM_LEVEL=trace` (server/client)          | Emits streaming chunk previews and timing metrics without throttling the response. |
| `DEBUG_INGESTION`                                                                     | `LOG_INGESTION_LEVEL=debug`                    | Prints ingestion metadata snapshots.                                               |
| `DEBUG_NOTION_X`                                                                      | `LOG_NOTION_LEVEL=debug`                       | Enables verbose Notion renderer logs on both client and server.                    |
| `DEBUG_NOTION_PAGE_ID`                                                                | `scripts/ingest-notion.ts --page=<pageId>`     | Use the CLI flag to ingest a single page in place of the env toggle.               |
| `FORCE_RAG_VERBOSE_RETRIEVAL_LOGS`                                                    | `TELEMETRY_DETAIL_OVERRIDE=verbose` (non-prod) | Telemetry detail governs when retrieval payloads are attached to Langfuse traces.  |

When you need temporary higher fidelity, set the domain-specific `LOG_*` env var (or overrides) rather than reintroducing ad-hoc env toggles.

We also emit one non-production debug entry from `telemetryLogger` on startup, showing `provider=langfuse`, whether public/secret keys are present, and the base URL (or `(default)`). The message never prints secrets and helps troubleshoot “Langfuse shows no traces”.

Langfuse no longer performs its own sampling; the legacy `LANGFUSE_SAMPLE_RATE_DEV`, `LANGFUSE_SAMPLE_RATE_PREVIEW`, and `LANGFUSE_SAMPLE_RATE_PROD` vars are ignored and will not affect runtime behavior. Sampling is instead governed entirely by `TELEMETRY_SAMPLE_RATE_*` plus the Admin telemetry config, and the startup log lists any ignored legacy vars in non‑production environments.

## PostHog analytics

Set `POSTHOG_API_KEY` (and optionally `POSTHOG_HOST`) to forward a small `chat_completion` event per chat request.

- Event name: `chat_completion`
- Required env vars:
  - `POSTHOG_API_KEY`
  - `POSTHOG_HOST` (optional, defaults to `https://app.posthog.com`)
- Captured properties:
  - `env`, `traffic` (`"visitor"` / `"synthetic"`, see [Synthetic traffic](#synthetic-traffic)), `trace_id`, `chat_session_id`, `preset_key`, `chat_engine`, `rag_enabled`, `prompt_version`, `guardrail_route`
  - `provider`, `model`, `embedding_model`
  - `latency_ms`, `latency_llm_ms`, `latency_retrieval_ms`
  - `retrieval_attempted`, `retrieval_used`, `aborted`
  - `total_tokens`, `response_cache_hit`, `retrieval_cache_hit`
  - `status` (`"success"` / `"error"`), `error_type` (short classifier)
- Missing values are emitted explicitly as `null` to keep dashboards and alerts stable.
- Distinct IDs prefer user ID, then anonymous/session IDs, trace ID, then `x-request-id`
- Privacy: no prompts, messages, chunk text, URLs, headers, cookies, IPs, or emails are transmitted.
- The events are fire-and-forget, nonblocking, and include `trace_id` so you can join them with Langfuse traces for richer dashboards.

## Synthetic traffic

Smoke tests and agent probes that call the production chat API are not visitors.
A request is **synthetic** only when it sends `x-jackgpt-synthetic: <token>` and the
token equals the server's `SYNTHETIC_TRAFFIC_TOKEN`
([`lib/server/api/chat-traffic.ts`](../../../lib/server/api/chat-traffic.ts)). Any
other request, including one with a wrong token, is a **visitor**: a bare marker would
let anyone hide their own conversation from the owner, and a wrong token is
over-reported rather than rejected so a misconfigured probe never breaks real chat.

Synthetic requests are labelled, never dropped, because a probe usually exists to check
that telemetry still arrives:

| Surface  | What changes                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Response | `X-Chat-Traffic: visitor \| synthetic` on every chat response, so a probe can confirm its token was accepted |
| Langfuse | Tag `traffic:<source>` and metadata `traffic` on the root observation                                        |
| PostHog  | `traffic` property on `chat_completion`; the weekly digest excludes `synthetic`                              |
| Telegram | Still sent, headed `🧪 JackGPT probe (synthetic, not a visitor)` instead of `💬 New JackGPT chat`            |

Anything that sends a chat request to production on purpose (a smoke run, a migration
probe, an ad hoc `curl`) must send the header. `pnpm smoke:chat`,
`pnpm smoke:langchain-chat` and the bakeoff recorder add it whenever
`SYNTHETIC_TRAFFIC_TOKEN` is set in their environment, and the two smoke scripts print
the classification the server returned. A one-off request adds it by hand:

```bash
curl -sS -D - -X POST https://www.jackhpark.com/api/chat \
  -H "Content-Type: application/json" \
  -H "x-jackgpt-synthetic: $SYNTHETIC_TRAFFIC_TOKEN" \
  -d '{"messages":[{"role":"user","content":"probe"}]}'
```

Requests sent before `traffic` existed have no value; queries treat a missing value as
`visitor`.

## Environment Variables

### Recommended production configuration

```bash
# ---------- Console Logging Levels ----------
# Options: off | error | info | debug | trace

LOG_GLOBAL_LEVEL=info
LOG_RAG_LEVEL=info
LOG_INGESTION_LEVEL=info
LOG_NOTION_LEVEL=info
LOG_LLM_LEVEL=info
LOG_TELEMETRY_LEVEL=info
LOG_DB_LEVEL=info

# ---------- Telemetry / Langfuse ----------

TELEMETRY_ENABLED=true
TELEMETRY_SAMPLE_RATE_DEFAULT=1
TELEMETRY_SAMPLE_RATE_MAX=1
TELEMETRY_DETAIL_DEFAULT=standard
TELEMETRY_DETAIL_MAX=standard

# Production strictly ignores these overrides:

# TELEMETRY_DETAIL_OVERRIDE

# TELEMETRY_SAMPLE_RATE_OVERRIDE
```

### Recommended non-production configuration

```bash
# ---------- Console Logging Levels ----------
# Options: off | error | info | debug | trace

LOG_GLOBAL_LEVEL=debug
LOG_RAG_LEVEL=debug
LOG_INGESTION_LEVEL=debug
LOG_NOTION_LEVEL=debug
LOG_LLM_LEVEL=debug
LOG_TELEMETRY_LEVEL=debug
LOG_DB_LEVEL=debug

# ---------- Telemetry / Langfuse ----------

TELEMETRY_ENABLED=true
TELEMETRY_SAMPLE_RATE_DEFAULT=1
TELEMETRY_SAMPLE_RATE_MAX=1
TELEMETRY_DETAIL_DEFAULT=verbose
TELEMETRY_DETAIL_MAX=verbose

# Non-production overrides (for debugging only)

# TELEMETRY_DETAIL_OVERRIDE=verbose

# TELEMETRY_SAMPLE_RATE_OVERRIDE=1
```

## Design Principles & Implementation Details

Our telemetry and logging implementation follows several key principles to ensure performance, security, and reliability:

- **Performance-First Gating**: Sampling and detail-level decisions are made upfront (via `decideTelemetryMode`). Expensive operations like building configuration snapshots or retrieval spans are only performed if the trace is sampled and the detail level requires it.
- **Shared Logic**: Both **Native** and **LangChain** engines share the same telemetry helpers (`decideTelemetryMode`, `buildLangfuseTags`, `buildRetrievalTelemetryEntries`), ensuring consistent tagging and payload structure across the entire application.
- **Fail-Safe Operation**: Telemetry is non-blocking and non-fatal. Errors in the telemetry client (e.g., Langfuse ingestion guards) do not affect the main chat response.
- **PII & Data Sanitization**:
  - `minimal` detail level omits user inputs and retrieval details entirely.
  - `standard` and `verbose` levels include the config snapshot.
  - `verbose` level includes retrieval spans, but payloads are capped and sanitized. For example, chunk text and potential PII from retrieval candidates are never transmitted to Langfuse; only metadata like `doc_id`, `similarity`, and `weight` are recorded.
- **Capped Payloads**: Retrieval telemetry is limited to the top **8 items** (controlled by `MAX_RETRIEVAL_TELEMETRY_ITEMS` in `lib/server/chat-common.ts`) to keep trace sizes manageable and avoid hitting ingestion limits.

## Testing

To verify the telemetry and logging configuration locally:

- **Unit Tests**: Run `pnpm test:unit` (or `node --import tsx --test test/chat-langfuse.test.ts` for specifically testing telemetry logic).
- **Diagnostics**: On startup (in non-production), `telemetryLogger` prints a summary including the provider (`langfuse`), visibility of API keys, and base URL. It also warns about any ignored legacy environment variables.

## Langfuse Guide

For detailed information on the specific data fields sent to Langfuse and how to build dashboards, see [Langfuse Guide](./langfuse-guide.md).

## Deprecated Environment Variables

These env vars are phased out and the config builder now warns when they are present (see the table above for supported replacements):

- `FORCE_RAG_VERBOSE_RETRIEVAL_LOGS`
- `DEBUG_RAG_URLS`
- `DEBUG_RAG_STEPS`
- `DEBUG_RAG_MSGS`
- `DEBUG_LANGFUSE`
- `DEBUG_NOTION_X`
- `DEBUG_OLLAMA_TIMING`
- `DEBUG_LANGCHAIN_STREAM`
- `NEXT_PUBLIC_DEBUG_LANGCHAIN_STREAM`
- `DEBUG_INGESTION`
- `DEBUG_NOTION_PAGE_ID`

Remove them from your `.env` files to keep the configuration clean.
