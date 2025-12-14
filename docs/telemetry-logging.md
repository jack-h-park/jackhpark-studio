# Logging & Telemetry Architecture

This document explains how we configure **logging** and **Langfuse telemetry** across both the **Native** and **LangChain** chat engines.

## Overview

- **Database (Admin configuration)** is the main source of truth for telemetry:
  - `telemetry.sampleRate`
  - `telemetry.detailLevel` (`"minimal" | "standard" | "verbose"`)
- **Environment variables** are treated as policy knobs:
  - `TELEMETRY_ENABLED` acts as a global kill switch.
  - `TELEMETRY_SAMPLE_RATE_DEFAULT` / `TELEMETRY_DETAIL_DEFAULT` provide sensible defaults when the database value is missing.
  - `TELEMETRY_SAMPLE_RATE_MAX` / `TELEMETRY_DETAIL_MAX` cap the maximum detail and sample rate.
  - `TELEMETRY_DETAIL_OVERRIDE` / `TELEMETRY_SAMPLE_RATE_OVERRIDE` are allowed only in non-production and are meant for temporary debugging.

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

## Logging vs Telemetry

Telemetry (Langfuse traces / observations) is controlled by `loggingConfig.telemetry`, while console logging is governed by domain loggers:

- `ragLogger`
- `ingestionLogger`
- `notionLogger`
- `llmLogger`

The domain loggers read their level from `LoggingConfig` and replace ad-hoc `console.log` calls. They enable consistent filtering per subsystem.

```ts
await ragLogger.debug("resolved retrieval candidates", { urls });
```

Avoid legacy `DEBUG_*` env vars; they are deprecated and deprecated env detection will warn you at startup.

### Replacing legacy `DEBUG_*` flags

| Legacy flag(s) | Replacement | Notes |
| --- | --- | --- |
| `DEBUG_RAG_STEPS`, `DEBUG_RAG_URLS`, `DEBUG_RAG_MSGS` | `LOG_RAG_LEVEL=debug` or `trace` | Enables guardrail, retrieval, and prompt logs across both engines. |
| `DEBUG_LANGCHAIN_STREAM`, `NEXT_PUBLIC_DEBUG_LANGCHAIN_STREAM`, `DEBUG_OLLAMA_TIMING` | `LOG_LLM_LEVEL=trace` (server/client) | Emits streaming chunk previews and timing metrics without throttling the response. |
| `DEBUG_INGESTION` | `LOG_INGESTION_LEVEL=debug` | Prints ingestion metadata snapshots. |
| `DEBUG_NOTION_X` | `LOG_NOTION_LEVEL=debug` | Enables verbose Notion renderer logs on both client and server. |
| `DEBUG_NOTION_PAGE_ID` | `scripts/ingest-notion.ts --page=<pageId>` | Use the CLI flag to ingest a single page in place of the env toggle. |
| `FORCE_RAG_VERBOSE_RETRIEVAL_LOGS` | `TELEMETRY_DETAIL_OVERRIDE=verbose` (non-prod) | Telemetry detail governs when retrieval payloads are attached to Langfuse traces. |

When you need temporary higher fidelity, set the domain-specific `LOG_*` env var (or overrides) rather than reintroducing ad-hoc env toggles.

## Environment Variables

### Recommended production configuration

# ---------- Global log levels ----------
LOG_GLOBAL_LEVEL=info
LOG_RAG_LEVEL=info
LOG_INGESTION_LEVEL=info
LOG_NOTION_LEVEL=info
LOG_LLM_LEVEL=info

# ---------- Telemetry / Langfuse ----------
TELEMETRY_ENABLED=true
TELEMETRY_SAMPLE_RATE_DEFAULT=1
TELEMETRY_SAMPLE_RATE_MAX=1
TELEMETRY_DETAIL_DEFAULT=standard
TELEMETRY_DETAIL_MAX=standard

# Production strictly ignores these overrides:
# TELEMETRY_DETAIL_OVERRIDE
# TELEMETRY_SAMPLE_RATE_OVERRIDE

### Recommended non-production configuration

# ---------- Global log levels ----------
LOG_GLOBAL_LEVEL=debug
LOG_RAG_LEVEL=debug
LOG_INGESTION_LEVEL=debug
LOG_NOTION_LEVEL=debug
LOG_LLM_LEVEL=debug

# ---------- Telemetry / Langfuse ----------
TELEMETRY_ENABLED=true
TELEMETRY_SAMPLE_RATE_DEFAULT=1
TELEMETRY_SAMPLE_RATE_MAX=1
TELEMETRY_DETAIL_DEFAULT=verbose
TELEMETRY_DETAIL_MAX=verbose

# Non-production overrides (for debugging only)
# TELEMETRY_DETAIL_OVERRIDE=verbose
# TELEMETRY_SAMPLE_RATE_OVERRIDE=1

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
