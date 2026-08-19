import "server-only";

import { NextResponse } from "next/server";

import {
  type ManualIngestionEvent,
  runManualIngestion,
} from "@/lib/admin/manual-ingestor";

type CompleteEvent = Extract<ManualIngestionEvent, { type: "complete" }>;

/**
 * Scheduled workspace ingest.
 *
 * Publishing to Notion reaches jackhpark.com on its own (ISR, ~60s) but reaches the vector
 * store only when someone runs an ingest, so the corpus drifts for as long as nobody
 * remembers. This is the same ingestion the dashboard runs — `runManualIngestion` with a
 * `partial` workspace request — on a schedule instead of a click.
 *
 * `partial` is what makes a daily run cheap: an unchanged page is detected by content hash
 * and skipped without embedding, so a quiet day costs page fetches and nothing else.
 *
 * Scheduled an hour before the corpus snapshot (`vercel.json`), so the daily metrics
 * describe the corpus after this run rather than the one before it.
 */

// Valid on every Vercel plan. The loop is bounded by `deadlineAt` below rather than by this,
// so raising it changes how much one invocation covers, never whether the run ends cleanly.
export const maxDuration = 60;

// Leaves room to finish the pages already in flight and write the run record after the
// loop stops starting new ones.
const DEADLINE_HEADROOM_MS = 12_000;

const unauthorizedResponse = NextResponse.json(
  { ok: false, error: "Unauthorized" },
  { status: 401 },
);

export async function GET(request: Request) {
  // Same secret model as the snapshot cron:
  // - Vercel Cron: Authorization: Bearer <CRON_SECRET>
  // - Manual/local: x-cron-secret: <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  const headerSecret = request.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;

  const authorized = Boolean(
    secret &&
      ((bearerToken && bearerToken === secret) ||
        (headerSecret && headerSecret === secret)),
  );

  if (!authorized) {
    return unauthorizedResponse;
  }

  const startedAt = Date.now();
  const logs: string[] = [];
  // A closure assignment does not narrow a `let`, so hold it on an object.
  const outcome: { completion: CompleteEvent | null } = { completion: null };

  try {
    await runManualIngestion(
      {
        mode: "notion_page",
        scope: "workspace",
        ingestionType: "partial",
        source: "cron/notion-page",
        deadlineAt: startedAt + maxDuration * 1000 - DEADLINE_HEADROOM_MS,
      },
      (event) => {
        if (event.type === "complete") {
          outcome.completion = event;
          return;
        }
        // Warnings and errors are the only lines worth keeping: a per-page "Fetching…" trail
        // is 156 lines of noise in a cron log.
        if (event.type === "log" && event.level && event.level !== "info") {
          logs.push(`[${event.level}] ${event.message}`);
        }
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Scheduled RAG ingest failed", { message });
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }

  const completion = outcome.completion;
  if (!completion) {
    // runManualIngestion emits `complete` on every path, including failure. Reaching here
    // means the contract changed; do not report a success we cannot substantiate.
    console.error("Scheduled RAG ingest produced no completion event");
    return NextResponse.json(
      { ok: false, error: "No completion event", durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }

  const { status, stats, message, runId, pagesNotReached } = completion;
  const incomplete = (pagesNotReached ?? 0) > 0;
  const body = {
    ok: status !== "failed",
    status,
    runId,
    message,
    incomplete,
    pagesNotReached: pagesNotReached ?? 0,
    documentsProcessed: stats.documentsProcessed,
    documentsAdded: stats.documentsAdded,
    documentsUpdated: stats.documentsUpdated,
    documentsSkipped: stats.documentsSkipped,
    errorCount: stats.errorCount,
    durationMs: Date.now() - startedAt,
    logs,
  };

  // A truncated run is not a failure — the next one continues — but it must be visible.
  if (incomplete) {
    console.warn("Scheduled RAG ingest hit its deadline", {
      pagesNotReached,
      durationMs: body.durationMs,
    });
  }

  return NextResponse.json(body, { status: status === "failed" ? 500 : 200 });
}
