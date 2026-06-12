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

function asFiniteNumber(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type LangfuseScoresPage = {
  data: Array<{
    name: string;
    value: number | null;
    traceId?: string | null;
    timestamp?: string | null;
    comment?: string | null;
  }>;
  meta: { page: number; totalPages: number };
};

async function fetchScores(
  baseUrl: string,
  auth: string,
  fromTimestamp: string,
): Promise<DigestScore[]> {
  const scores: DigestScore[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL("/api/public/v2/scores", baseUrl);
    url.searchParams.set("fromTimestamp", fromTimestamp);
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));
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
        value: s.value,
        traceId: s.traceId ?? null,
        timestamp: s.timestamp ?? null,
        comment: s.comment ?? null,
      });
    }
    totalPages = body.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return scores;
}

/**
 * Pulls product metrics from PostHog via a single HogQL query over
 * `chat_completion` events. Requires a PostHog *personal* API key (phx_…) — the
 * phc_ capture key in the app env cannot query. Returns null when not configured
 * so the digest degrades gracefully to Langfuse-only.
 */
async function fetchPostHogMetrics(
  days: number,
): Promise<PostHogMetrics | null> {
  const personalKey = readOptionalEnv("POSTHOG_PERSONAL_API_KEY");
  if (!personalKey) {
    return null;
  }
  // `@current` resolves to the personal key's default project, so only the key
  // is required. Set POSTHOG_PROJECT_ID to target a specific project.
  const projectId = readOptionalEnv("POSTHOG_PROJECT_ID") ?? "@current";
  const host = readOptionalEnv("POSTHOG_API_HOST") ?? "https://us.posthog.com";

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
    WHERE event = 'chat_completion' AND timestamp > now() - toIntervalDay(${days})
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
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const window = {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };

  const scores = await fetchScores(baseUrl, auth, from.toISOString());
  const posthog = await fetchPostHogMetrics(days);
  const digest = computeWeeklyDigest(scores, window);
  const markdown = renderWeeklyDigestMarkdown(digest, posthog);

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
