import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();

type CronEntry = { path: string; schedule: string };

const crons: CronEntry[] = (
  JSON.parse(readFileSync(path.join(repoRoot, "vercel.json"), "utf8")) as {
    crons: CronEntry[];
  }
).crons;

function routeFileFor(cronPath: string): string {
  // /api/internal/rag/ingest -> app/api/internal/rag/ingest/route.ts
  return path.join(repoRoot, "app", cronPath.replace(/^\/api\//, "api/"), "route.ts");
}

function hourOf(schedule: string): number {
  return Number.parseInt(schedule.split(" ")[1]!, 10);
}

void describe("scheduled RAG jobs", () => {
  void it("points every cron at a route that exists", () => {
    // A cron aimed at a missing route 404s on a schedule and reports nothing. Nothing else
    // in the build checks this: `vercel.json` is data, and the route is a file path.
    assert.ok(crons.length > 0, "vercel.json declares no crons");
    for (const cron of crons) {
      assert.ok(
        existsSync(routeFileFor(cron.path)),
        `${cron.path} has no route file at ${path.relative(repoRoot, routeFileFor(cron.path))}`,
      );
    }
  });

  void it("ingests before it snapshots, so the daily metrics describe the fresh corpus", () => {
    const ingest = crons.find((c) => c.path.endsWith("/rag/ingest"));
    const snapshot = crons.find((c) => c.path.endsWith("/rag/snapshot"));
    assert.ok(ingest, "no scheduled ingest");
    assert.ok(snapshot, "no scheduled snapshot");
    assert.ok(
      hourOf(ingest.schedule) < hourOf(snapshot.schedule),
      `ingest (${ingest.schedule}) must run before snapshot (${snapshot.schedule}); ` +
        "otherwise every snapshot describes the corpus as it was before that day's ingest",
    );
  });

  void it("declares a duration that is valid on any plan", () => {
    // Chosen so a deploy cannot fail on a plan-specific ceiling. The loop is bounded by its
    // own deadline rather than by this number.
    const source = readFileSync(
      path.join(repoRoot, "app/api/internal/rag/ingest/route.ts"),
      "utf8",
    );
    const declared = /export const maxDuration = (\d+)/.exec(source);
    assert.ok(declared, "the ingest route must declare maxDuration");
    assert.ok(
      Number.parseInt(declared[1]!, 10) <= 60,
      "maxDuration above 60 is rejected on the Hobby plan; raise it only deliberately",
    );
  });
});

void describe("scheduled ingest authorization", () => {
  void it("refuses a request with no secret, and one with the wrong secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    const { GET } = await import("@/app/api/internal/rag/ingest/route");

    // Neither call reaches Notion or Supabase: the gate returns before any work starts.
    const noSecret = await GET(new Request("https://example.com/api/internal/rag/ingest"));
    assert.equal(noSecret.status, 401);

    const wrongBearer = await GET(
      new Request("https://example.com/api/internal/rag/ingest", {
        headers: { authorization: "Bearer nope" },
      }),
    );
    assert.equal(wrongBearer.status, 401);

    const wrongHeader = await GET(
      new Request("https://example.com/api/internal/rag/ingest", {
        headers: { "x-cron-secret": "nope" },
      }),
    );
    assert.equal(wrongHeader.status, 401);
  });
});
