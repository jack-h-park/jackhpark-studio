/**
 * Weekly telemetry digest.
 *
 * Pulls the last N days of Langfuse scores (retrieval quality + user feedback),
 * aggregates them, and prints a markdown digest with deterministic, rule-based
 * takeaways. The heavy lifting lives in `lib/server/telemetry/digest.ts` so the
 * aggregation is unit-testable; this file is just I/O.
 *
 * Run: `pnpm telemetry:digest` (loads .env.local). Optional flags:
 *   --days <n>     lookback window in days (default 7)
 *   --out <path>   also write the markdown to a file
 *   --env <name>   PostHog env to report on (default "prod"; "all" for no filter)
 *
 * PostHog product metrics (latency p50/p95/p99, volume, error/abort/cache rates)
 * are folded in when POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID are set —
 * querying needs a personal (phx_) key, not the phc_ capture key. Without them
 * the digest stays Langfuse-only. See docs/telemetry/weekly-digest.md.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  computeWeeklyDigest,
  type DigestScore,
  type LangfuseEngineeringMetrics,
  type PostHogMetrics,
  renderWeeklyDigestMarkdown,
} from "@/lib/server/telemetry/digest";

function readEnv(name: string): string {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return cleanEnv(raw);
}

function readOptionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  return raw ? cleanEnv(raw) : undefined;
}

// .env.local quotes some values; strip surrounding quotes/whitespace.
function cleanEnv(raw: string): string {
  return raw.trim().replaceAll(/^["']|["']$/g, "");
}

function parseFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

// The env value is interpolated into HogQL, so keep it to an identifier-safe
// shape rather than trusting the flag.
function assertSafeEnv(env: string): string {
  if (!/^[\w-]+$/.test(env)) {
    throw new Error(
      `Invalid --env value: ${env} (expected letters, digits, "_" or "-", or "all")`,
    );
  }
  return env;
}

function asFiniteNumber(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Langfuse metrics return counts as strings (e.g. "45"); coerce safely.
function coerceNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

type LangfuseScoreRow = {
  name: string;
  value: number | boolean | string | null;
  dataType?: string | null;
  timestamp?: string | null;
  comment?: string | null;
  subject?: { kind?: string | null; id?: string | null } | null;
};

type LangfuseScoresPage = {
  data: LangfuseScoreRow[];
  meta?: { cursor?: string | null };
};

/**
 * Scores API v3 returns a single `value` typed by `dataType`, so BOOLEAN scores
 * (`user_feedback`) now arrive as true/false where v2 sent 1/0. The aggregation
 * layer compares `value === 1`, which a boolean silently fails — every 👍 would
 * be counted as 👎. Collapse booleans back to numbers here so `digest.ts` and
 * its unit tests stay untouched.
 */
function normalizeScoreValue(row: LangfuseScoreRow): number | null {
  if (typeof row.value === "boolean") {
    return row.value ? 1 : 0;
  }
  return typeof row.value === "number" && Number.isFinite(row.value)
    ? row.value
    : null;
}

async function fetchScores(
  baseUrl: string,
  auth: string,
  fromTimestamp: string,
): Promise<DigestScore[]> {
  const scores: DigestScore[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL("/api/public/v3/scores", baseUrl);
    url.searchParams.set("fromTimestamp", fromTimestamp);
    url.searchParams.set("limit", "100");
    // v3 returns only core fields by default: `comment` lives in the `details`
    // group and the trace reference moved into the `subject` object.
    url.searchParams.set("fields", "details,subject");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      throw new Error(
        `Langfuse scores fetch failed: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as LangfuseScoresPage;
    for (const s of body.data) {
      scores.push({
        name: s.name,
        value: normalizeScoreValue(s),
        traceId: s.subject?.kind === "trace" ? (s.subject.id ?? null) : null,
        timestamp: s.timestamp ?? null,
        comment: s.comment ?? null,
      });
    }
    cursor = body.meta?.cursor ?? null;
  } while (cursor);
  return scores;
}

/**
 * Pulls engineering metrics from the Langfuse metrics API — trace/observation
 * volume, model cost (unique to Langfuse), and generation latency. Uses the same
 * Langfuse credentials as the scores fetch, so it's always available here.
 */
async function fetchLangfuseMetrics(
  baseUrl: string,
  auth: string,
  fromTimestamp: string,
  toTimestamp: string,
): Promise<LangfuseEngineeringMetrics | null> {
  const query = (view: string, metrics: unknown[], filters: unknown[]) => {
    const url = new URL("/api/public/v2/metrics", baseUrl);
    url.searchParams.set(
      "query",
      JSON.stringify({ view, metrics, filters, fromTimestamp, toTimestamp }),
    );
    return url;
  };
  const run = async (
    view: string,
    metrics: unknown[],
    filters: unknown[] = [],
  ) => {
    const res = await fetch(query(view, metrics, filters), {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      throw new Error(`Langfuse metrics fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    return body.data[0] ?? {};
  };

  // Metrics API v2 removed the "traces" view: a trace is no longer an entity,
  // just the observations sharing a trace ID. Trace volume becomes the count of
  // root observations. Cross-checked against the v1 "traces" view over
  // 2026-08-18..25 — both report 21.
  const traces = await run(
    "observations",
    [{ measure: "count", aggregation: "count" }],
    [
      {
        column: "isRootObservation",
        operator: "=",
        value: true,
        type: "boolean",
      },
    ],
  );
  // Expect observationCount to step up by roughly the trace count relative to
  // the v1 numbers (119 → 140 over the window above). While ingestion is still
  // legacy, Langfuse v4 synthesizes a `t-<traceId>` root observation per trace,
  // and v2 counts those. The gap closes once Phase 4 exports real root spans.
  const obs = await run("observations", [
    { measure: "count", aggregation: "count" },
    { measure: "totalCost", aggregation: "sum" },
    { measure: "latency", aggregation: "p95" },
  ]);

  return {
    traceCount: coerceNumber(traces.count_count) ?? 0,
    observationCount: coerceNumber(obs.count_count) ?? 0,
    totalCostUsd: coerceNumber(obs.sum_totalCost),
    generationLatencyP95Ms: coerceNumber(obs.p95_latency),
  };
}

/**
 * Pulls product metrics from PostHog via a single HogQL query over
 * `chat_completion` events. Requires a PostHog *personal* API key (phx_…) — the
 * phc_ capture key in the app env cannot query. Returns null when not configured
 * so the digest degrades gracefully to Langfuse-only.
 */
async function fetchPostHogMetrics(
  days: number,
  env: string,
): Promise<PostHogMetrics | null> {
  const personalKey = readOptionalEnv("POSTHOG_PERSONAL_API_KEY");
  if (!personalKey) {
    return null;
  }
  // `@current` resolves to the personal key's default project, so only the key
  // is required. Set POSTHOG_PROJECT_ID to target a specific project.
  const projectId = readOptionalEnv("POSTHOG_PROJECT_ID") ?? "@current";
  const host = readOptionalEnv("POSTHOG_API_HOST") ?? "https://us.posthog.com";

  // Without this predicate local dev traffic is counted as production: dev
  // requests outnumber prod here, so an unfiltered window reports dev failures
  // as prod error/abort rates. `--env all` opts out.
  const envPredicate =
    env === "all" ? "" : ` AND properties.env = '${assertSafeEnv(env)}'`;

  const query = `
    SELECT
      count() AS requests,
      uniq(person_id) AS distinct_users,
      round(quantile(0.50)(toFloat(properties.latency_ms)), 0) AS p50,
      round(quantile(0.95)(toFloat(properties.latency_ms)), 0) AS p95,
      round(quantile(0.99)(toFloat(properties.latency_ms)), 0) AS p99,
      round(avg(if(properties.status = 'error', 1, 0)), 4) AS error_rate,
      round(avg(if(properties.response_cache_hit, 1, 0)), 4) AS resp_cache_hit_rate,
      round(avg(if(properties.aborted, 1, 0)), 4) AS abort_rate,
      round(avg(toFloat(properties.total_tokens)), 0) AS avg_tokens
    FROM events
    WHERE event = 'chat_completion' AND timestamp > now() - toIntervalDay(${days})${envPredicate}
  `;

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${personalKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    throw new Error(
      `PostHog query failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { results?: Array<Array<number | null>> };
  const row = body.results?.[0];
  if (!row) {
    return null;
  }
  return {
    env,
    requests: asFiniteNumber(row[0]) ?? 0,
    distinctUsers: asFiniteNumber(row[1]) ?? 0,
    latencyP50Ms: asFiniteNumber(row[2]),
    latencyP95Ms: asFiniteNumber(row[3]),
    latencyP99Ms: asFiniteNumber(row[4]),
    errorRate: asFiniteNumber(row[5]),
    responseCacheHitRate: asFiniteNumber(row[6]),
    abortRate: asFiniteNumber(row[7]),
    avgTokens: asFiniteNumber(row[8]),
  };
}

try {
  const publicKey = readEnv("LANGFUSE_PUBLIC_KEY");
  const secretKey = readEnv("LANGFUSE_SECRET_KEY");
  const baseUrl = readEnv("LANGFUSE_BASE_URL");
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

  const days = Number.parseInt(parseFlag("days") ?? "7", 10);
  const env = parseFlag("env") ?? "prod";
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const window = {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };

  const scores = await fetchScores(baseUrl, auth, from.toISOString());
  const langfuseMetrics = await fetchLangfuseMetrics(
    baseUrl,
    auth,
    from.toISOString(),
    now.toISOString(),
  );
  const posthog = await fetchPostHogMetrics(days, env);
  const digest = computeWeeklyDigest(scores, window);
  const markdown = renderWeeklyDigestMarkdown(digest, posthog, langfuseMetrics);

  process.stdout.write(`${markdown}\n`);

  const outPath = parseFlag("out");
  if (outPath) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, markdown, "utf8");
    process.stderr.write(`\nDigest written to ${outPath}\n`);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
