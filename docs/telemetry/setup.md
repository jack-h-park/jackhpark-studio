# Telemetry setup & environment reference

The single place that answers: **which telemetry env vars exist, what each is for, and which environment needs it.** For what the three backends *do* and how they differ, start with the [3-backend table in the README](README.md#three-observability-backends-at-a-glance).

## Write vs. read — the key distinction

Telemetry splits into two access patterns, and they need different credentials in different places:

- **Write (instrumentation)** — the running app *emits* traces and events. Lives in the deployed prod app and local dev.
- **Read (analysis)** — the weekly digest *queries* what was emitted. Lives wherever the digest runs (local, cron, or CI), **never** in the prod web app.

A consequence worth internalizing: the PostHog **capture** key (`phc_…`) writes events from the app; the PostHog **personal** key (`phx_…`) reads analytics for the digest. They are different keys with different homes.

## Master env-var reference

Environment column legend: **App-server** = prod/dev Next.js server runtime · **Build** = baked into the client bundle at build time · **Digest** = wherever `pnpm telemetry:digest` runs (local/cron/CI).

### Langfuse (LLM engineering observability)

| Variable | Purpose | Environment | Required? |
|----------|---------|-------------|-----------|
| `LANGFUSE_PUBLIC_KEY` | API key (write traces / read scores) | App-server + Digest | Required for any Langfuse |
| `LANGFUSE_SECRET_KEY` | API secret | App-server + Digest | Required for any Langfuse |
| `LANGFUSE_BASE_URL` | Region host, e.g. `https://us.cloud.langfuse.com` | App-server + Digest | Required (region-specific) |
| `LANGFUSE_INCLUDE_PII` | Store chat transcripts (question **and** answer) on traces when `true` | App-server | Optional (default false); pair with the recording notice in the chat UI |
| `LANGFUSE_PROJECT_ID` | Project id for trace deep links in notifications | App-server | Optional — auto-resolved from the API keys; set only to override |
| `LANGFUSE_ENV_TAG` | Overrides the `env:` trace tag | App-server | Optional |
| `LANGFUSE_ATTACH_PROVIDER_METADATA` | Attach provider metadata to traces | App-server | Optional |
| `LANGFUSE_TIMEOUT` | Client timeout (ms) | App-server | Optional |

> Note: `langfuse-langchain`'s `CallbackHandler` historically read `LANGFUSE_BASEURL` (no underscore) and defaulted to the EU host. The retrieval graph now passes host/keys explicitly, so `LANGFUSE_BASE_URL` is the source of truth — see [trace topology](../architecture/langchain-chat-architecture.md#trace-topology-langfuse--langsmith).

### LangSmith (LangGraph graph-level observability)

Auto-tracing only — no bespoke code. All App-server, all optional (enables a complementary nested view of the retrieval graph).

| Variable | Purpose | Environment | Required? |
|----------|---------|-------------|-----------|
| `LANGSMITH_TRACING` | `true` enables auto-tracing the graph | App-server | Optional |
| `LANGSMITH_API_KEY` | LangSmith API key | App-server | Required only if tracing on |
| `LANGSMITH_PROJECT` | Target project (e.g. `jackgpt-rag`) | App-server | Optional (else `default`) |
| `LANGSMITH_ENDPOINT` | API host | App-server | Optional |

> If LangSmith looks empty, confirm the dashboard project selector matches `LANGSMITH_PROJECT` (`jackgpt-rag`), not `default`.

### PostHog (product analytics)

| Variable | Purpose | Environment | Required? |
|----------|---------|-------------|-----------|
| `NEXT_PUBLIC_POSTHOG_ID` | Capture key (`phc_…`) for browser `$pageview` | **Build** | Required for client analytics |
| `POSTHOG_API_KEY` | Capture key (`phc_…`) for server `chat_completion` | App-server | Required for server analytics |
| `POSTHOG_HOST` | Capture host | App-server | Optional (default `https://app.posthog.com`) |
| `POSTHOG_PERSONAL_API_KEY` | **Personal** key (`phx_…`, scope `query:read`) for the digest | **Digest only** | Required for the PostHog digest section |
| `POSTHOG_PROJECT_ID` | Project for digest queries | Digest only | Optional (default `@current`) |
| `POSTHOG_API_HOST` | Query host | Digest only | Optional (default `https://us.posthog.com`) |

> ⚠️ **Security:** `POSTHOG_PERSONAL_API_KEY` is powerful (org-wide read). Keep it only where the digest runs. **Do not put it in the prod web app env.**

### Owner notifications (Telegram)

Fire-and-forget heads-up when a visitor starts a new chat (first turn of a
conversation), with a deep link to the Langfuse trace. All App-server, all
optional — silently disabled when unset.

| Variable | Purpose | Environment | Required? |
|----------|---------|-------------|-----------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | App-server | Required for notifications |
| `TELEGRAM_CHAT_ID` | Your chat id (e.g. via @userinfobot) | App-server | Required for notifications |
| `CHAT_NOTIFY_ENV` | Only notify in this env | App-server | Optional (default `prod`) |

> The trace deep link may show "still being processed" if clicked immediately —
> the notification fires at chat start, while Langfuse UI ingestion takes
> ~1–2 minutes. The link works once ingestion completes.

### Cross-cutting controls

| Variable | Purpose | Environment | Required? |
|----------|---------|-------------|-----------|
| `TELEMETRY_ENABLED` | Global kill switch for PostHog + Langfuse | App-server | Optional (default `true`) |
| `TELEMETRY_SAMPLE_RATE_DEFAULT` / `_MAX` / `_OVERRIDE` | Trace sampling | App-server | Optional — see [telemetry-logging.md](implementation/telemetry-logging.md) |
| `TELEMETRY_DETAIL_DEFAULT` / `_MAX` / `_OVERRIDE` | Trace detail level | App-server | Optional — see [telemetry-logging.md](implementation/telemetry-logging.md) |
| `LOG_*` (e.g. `LOG_RAG_LEVEL`) | Per-domain log levels | App-server | Optional — see [telemetry-logging.md](implementation/telemetry-logging.md) |

## Setup by environment

**Prod web app (Vercel deploy)** — instrumentation only:
- Required: `POSTHOG_API_KEY`, `NEXT_PUBLIC_POSTHOG_ID` (build-time), `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`
- Optional: `LANGSMITH_*` (graph tracing), `TELEMETRY_*` tuning, `LANGFUSE_*` tuning
- **Never:** `POSTHOG_PERSONAL_API_KEY`

**Local dev (`.env.local`)** — same as prod app, plus the digest vars below if you run the digest locally.

**Digest runner (local / cron / CI)** — analysis only:
- Required: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, and (for the PostHog section) `POSTHOG_PERSONAL_API_KEY`
- Optional: `POSTHOG_PROJECT_ID`, `POSTHOG_API_HOST`

See [weekly-digest.md](weekly-digest.md) for digest usage.
