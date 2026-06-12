/**
 * Sync analysis definitions (as code) to the live backends — the dashboard
 * equivalent of infrastructure-as-code.
 *
 *   - PostHog insights (HogQL) ← POSTHOG_PERSONAL_API_KEY
 *   - Langfuse score configs   ← LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY
 *
 * Idempotent: insights match by name and are updated in place; score configs
 * are created only when missing. Each backend is skipped (not failed) when its
 * credentials are absent. Read/analysis credentials only — never the app's
 * write keys. Run: `pnpm telemetry:sync` (loads .env.local).
 *
 * Definitions live in lib/server/telemetry/analytics-definitions.ts.
 */
import {
  LANGFUSE_SCORE_CONFIGS,
  MANAGED_DASHBOARD,
  MANAGED_INSIGHT_PREFIX,
  MANAGED_INSIGHT_TAG,
  POSTHOG_INSIGHTS,
} from "@/lib/server/telemetry/analytics-definitions";

function readOptionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  return raw ? raw.trim().replaceAll(/^["']|["']$/g, "") : undefined;
}

// ── PostHog insights ────────────────────────────────────────────────────────

type PostHogInsight = { short_id: string; name: string | null };

/** Find the managed dashboard by name, creating it if absent. Returns its id. */
async function ensureDashboard(
  projectBase: string,
  headers: Record<string, string>,
): Promise<number> {
  let next: string | null = `${projectBase}/dashboards/?limit=100`;
  while (next) {
    const res = await fetch(next, { headers });
    if (!res.ok) {
      throw new Error(`PostHog dashboards list failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      results: Array<{ id: number; name: string | null; deleted?: boolean }>;
      next: string | null;
    };
    const found = body.results.find(
      (d) => d.name === MANAGED_DASHBOARD.name && !d.deleted,
    );
    if (found) {
      return found.id;
    }
    next = body.next;
  }
  const res = await fetch(`${projectBase}/dashboards/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: MANAGED_DASHBOARD.name,
      description: MANAGED_DASHBOARD.description,
      tags: [MANAGED_INSIGHT_TAG],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `PostHog dashboard create failed: ${res.status} — ${await res.text()}`,
    );
  }
  const created = (await res.json()) as { id: number };
  process.stdout.write(
    `PostHog: created dashboard "${MANAGED_DASHBOARD.name}"\n`,
  );
  return created.id;
}

async function syncPostHogInsights(): Promise<void> {
  const key = readOptionalEnv("POSTHOG_PERSONAL_API_KEY");
  if (!key) {
    process.stdout.write("PostHog: no POSTHOG_PERSONAL_API_KEY — skipped\n");
    return;
  }
  const projectId = readOptionalEnv("POSTHOG_PROJECT_ID") ?? "@current";
  const host = readOptionalEnv("POSTHOG_API_HOST") ?? "https://us.posthog.com";
  const projectBase = `${host}/api/projects/${projectId}`;
  const base = `${projectBase}/insights`;
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  const dashboardId = await ensureDashboard(projectBase, headers);

  // Build name → short_id for existing managed insights (paginate).
  const existing = new Map<string, string>();
  let next: string | null = `${base}/?limit=100`;
  while (next) {
    const res = await fetch(next, { headers });
    if (!res.ok) {
      throw new Error(`PostHog insights list failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      results: PostHogInsight[];
      next: string | null;
    };
    for (const i of body.results) {
      if (i.name?.startsWith(MANAGED_INSIGHT_PREFIX)) {
        existing.set(i.name, i.short_id);
      }
    }
    next = body.next;
  }

  for (const def of POSTHOG_INSIGHTS) {
    const name = `${MANAGED_INSIGHT_PREFIX} ${def.name}`;
    const payload = {
      name,
      description: def.description,
      tags: [MANAGED_INSIGHT_TAG],
      saved: true,
      dashboards: [dashboardId],
      query: {
        kind: "DataVisualizationNode",
        source: { kind: "HogQLQuery", query: def.hogql.trim() },
      },
    };
    const shortId = existing.get(name);
    const res = shortId
      ? await fetch(`${base}/${shortId}/`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        })
      : await fetch(`${base}/`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
    if (!res.ok) {
      throw new Error(
        `PostHog insight "${name}" ${shortId ? "update" : "create"} failed: ${res.status} — ${await res.text()}`,
      );
    }
    process.stdout.write(
      `PostHog: ${shortId ? "updated" : "created"} "${name}"\n`,
    );
  }
}

// ── Langfuse score configs ──────────────────────────────────────────────────

async function syncLangfuseScoreConfigs(): Promise<void> {
  const publicKey = readOptionalEnv("LANGFUSE_PUBLIC_KEY");
  const secretKey = readOptionalEnv("LANGFUSE_SECRET_KEY");
  const baseUrl = readOptionalEnv("LANGFUSE_BASE_URL");
  if (!publicKey || !secretKey || !baseUrl) {
    process.stdout.write("Langfuse: credentials missing — skipped\n");
    return;
  }
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  // Existing config names (paginate).
  const existing = new Set<string>();
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetch(
      `${baseUrl}/api/public/score-configs?limit=100&page=${page}`,
      { headers },
    );
    if (!res.ok) {
      throw new Error(`Langfuse score-configs list failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      data: Array<{ name: string }>;
      meta: { totalPages: number };
    };
    for (const c of body.data) existing.add(c.name);
    totalPages = body.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);

  for (const def of LANGFUSE_SCORE_CONFIGS) {
    if (existing.has(def.name)) {
      process.stdout.write(`Langfuse: "${def.name}" exists — skipped\n`);
      continue;
    }
    const res = await fetch(`${baseUrl}/api/public/score-configs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: def.name,
        dataType: def.dataType,
        ...(def.minValue === undefined ? {} : { minValue: def.minValue }),
        ...(def.maxValue === undefined ? {} : { maxValue: def.maxValue }),
        ...(def.description ? { description: def.description } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Langfuse score-config "${def.name}" create failed: ${res.status} — ${await res.text()}`,
      );
    }
    process.stdout.write(`Langfuse: created "${def.name}"\n`);
  }
}

try {
  await syncPostHogInsights();
  await syncLangfuseScoreConfigs();
  process.stdout.write("\nSync complete.\n");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
