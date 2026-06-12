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
  MANAGED_DASHBOARDS,
  MANAGED_INSIGHT_PREFIX,
  MANAGED_INSIGHT_TAG,
  RETIRED_DASHBOARD_NAMES,
  RETIRED_INSIGHT_NAMES,
} from "@/lib/server/telemetry/analytics-definitions";

function readOptionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  return raw ? raw.trim().replaceAll(/^["']|["']$/g, "") : undefined;
}

// ── PostHog dashboards + insights ────────────────────────────────────────────

type Headers = Record<string, string>;

/** Find a managed dashboard by name, creating it if absent. Returns its id. */
async function ensureDashboard(
  projectBase: string,
  headers: Headers,
  name: string,
  description: string,
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
    const found = body.results.find((d) => d.name === name && !d.deleted);
    if (found) {
      return found.id;
    }
    next = body.next;
  }
  const res = await fetch(`${projectBase}/dashboards/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, description, tags: [MANAGED_INSIGHT_TAG] }),
  });
  if (!res.ok) {
    throw new Error(
      `PostHog dashboard create failed: ${res.status} — ${await res.text()}`,
    );
  }
  const created = (await res.json()) as { id: number };
  process.stdout.write(`PostHog: created dashboard "${name}"\n`);
  return created.id;
}

/** Map of existing managed insight name → short_id (paginated). */
async function listManagedInsights(
  base: string,
  headers: Headers,
): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  let next: string | null = `${base}/?limit=100`;
  while (next) {
    const res = await fetch(next, { headers });
    if (!res.ok) {
      throw new Error(`PostHog insights list failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      results: Array<{ short_id: string; name: string | null }>;
      next: string | null;
    };
    for (const i of body.results) {
      if (i.name?.startsWith(MANAGED_INSIGHT_PREFIX)) {
        existing.set(i.name, i.short_id);
      }
    }
    next = body.next;
  }
  return existing;
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
  const headers: Headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  const existing = await listManagedInsights(base, headers);

  for (const dashboard of MANAGED_DASHBOARDS) {
    const dashboardId = await ensureDashboard(
      projectBase,
      headers,
      dashboard.name,
      dashboard.description,
    );
    for (const def of dashboard.insights) {
      const name = `${MANAGED_INSIGHT_PREFIX} ${def.name}`;
      const payload = {
        name,
        description: def.description,
        tags: [MANAGED_INSIGHT_TAG],
        saved: true,
        dashboards: [dashboardId],
        query: def.query,
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
        `PostHog: ${shortId ? "updated" : "created"} "${name}" → ${dashboard.name}\n`,
      );
    }
  }

  await retirePostHog(projectBase, base, headers, existing);
}

/** Soft-delete superseded dashboards + insights so consolidation is reproducible. */
async function retirePostHog(
  projectBase: string,
  base: string,
  headers: Headers,
  existingInsights: Map<string, string>,
): Promise<void> {
  for (const insightName of RETIRED_INSIGHT_NAMES) {
    const fullName = `${MANAGED_INSIGHT_PREFIX} ${insightName}`;
    const shortId = existingInsights.get(fullName);
    if (!shortId) {
      continue;
    }
    const res = await fetch(`${base}/${shortId}/`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ deleted: true }),
    });
    if (res.ok) {
      process.stdout.write(`PostHog: retired insight "${fullName}"\n`);
    }
  }

  if (RETIRED_DASHBOARD_NAMES.length === 0) {
    return;
  }
  let next: string | null = `${projectBase}/dashboards/?limit=100`;
  const toRetire: Array<{ id: number; name: string }> = [];
  while (next) {
    const res = await fetch(next, { headers });
    if (!res.ok) {
      break;
    }
    const body = (await res.json()) as {
      results: Array<{ id: number; name: string | null; deleted?: boolean }>;
      next: string | null;
    };
    for (const d of body.results) {
      if (d.name && !d.deleted && RETIRED_DASHBOARD_NAMES.includes(d.name)) {
        toRetire.push({ id: d.id, name: d.name });
      }
    }
    next = body.next;
  }
  for (const d of toRetire) {
    const res = await fetch(`${projectBase}/dashboards/${d.id}/`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ deleted: true }),
    });
    if (res.ok) {
      process.stdout.write(`PostHog: retired dashboard "${d.name}"\n`);
    }
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
