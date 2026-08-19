import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  anyLaneStale,
  FRESHNESS_LANES,
  type FreshnessLane,
  judgeFreshness,
  resolveStaleAfterHours,
} from "@/lib/rag/freshness";

/**
 * Read-only freshness report for the RAG corpus.
 *
 * Everything that keeps the corpus current is now automated, which means nothing is watching
 * it. A scheduled ingest that stops running looks exactly like one with nothing to do: the
 * runs list simply has no new rows, and the assistant keeps answering — from an increasingly
 * old corpus. This endpoint exists to be polled from outside Vercel, so the watcher does not
 * share a failure domain with the thing it watches.
 *
 * The signal is time since the last *successful* ingest run, not a Notion comparison. A
 * pipeline that runs and misses pages is already reported by `pagesNotReached`; what is
 * unreported is a pipeline that does not run at all, and that is what this measures — for
 * the cost of two indexed queries rather than a full Notion crawl.
 */

const unauthorizedResponse = NextResponse.json(
  { ok: false, error: "Unauthorized" },
  { status: 401 },
);

export async function GET(request: Request) {
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

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const staleAfterHours = resolveStaleAfterHours();

  // One lane per thing the schedule covers, each keyed on the `scope` its runs record.
  //
  // Scoping matters more than it looks: any run at all resets a naive clock, so a
  // single-page CLI refresh — or a one-document verification run — would report the corpus
  // as fresh while the job that actually keeps it current had been dead for a month. That is
  // not hypothetical; it is what the first version of this endpoint reported.
  //
  // Rows predating the metadata field are excluded, which can only overstate staleness — the
  // safe direction for an alarm.
  const lanes: Partial<
    Record<
      FreshnessLane,
      ReturnType<typeof judgeFreshness> & {
        label: string;
        lastSuccessfulRun: Record<string, unknown> | null;
      }
    >
  > = {};

  for (const scope of Object.keys(FRESHNESS_LANES) as FreshnessLane[]) {
    const { data } = await supabase
      .from("rag_ingest_runs")
      .select("id,source,status,started_at,ended_at,documents_processed")
      .eq("status", "success")
      .eq("metadata->>scope", scope)
      .order("started_at", { ascending: false })
      .limit(1);

    const success = data?.[0] ?? null;
    lanes[scope] = {
      ...judgeFreshness({
        lastSuccessAt:
          (success?.ended_at as string | null) ??
          (success?.started_at as string | null) ??
          null,
        staleAfterHours,
      }),
      label: FRESHNESS_LANES[scope],
      lastSuccessfulRun: success
        ? {
            id: success.id,
            source: success.source,
            endedAt: success.ended_at ?? success.started_at,
            documentsProcessed: success.documents_processed ?? null,
          }
        : null,
    };
  }

  // The most recent run of any kind, for triage: "failed an hour ago" and "has not run since
  // Tuesday" are different problems, and a staleness number alone cannot tell them apart.
  const { data: lastAny } = await supabase
    .from("rag_ingest_runs")
    .select("id,source,status,started_at")
    .order("started_at", { ascending: false })
    .limit(1);
  const latest = lastAny?.[0] ?? null;

  const counts: Record<string, number> = {};
  for (const status of ["active", "missing", "soft_deleted"]) {
    const { count } = await supabase
      .from("rag_documents")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    counts[status] = count ?? 0;
  }

  const { data: oldest } = await supabase
    .from("rag_documents")
    .select("last_ingested_at")
    .eq("status", "active")
    .order("last_ingested_at", { ascending: true })
    .limit(1);

  return NextResponse.json({
    ok: true,
    stale: anyLaneStale(lanes),
    staleAfterHours,
    lanes,
    lastRun: latest
      ? {
          id: latest.id,
          source: latest.source,
          status: latest.status,
          startedAt: latest.started_at,
        }
      : null,
    documents: counts,
    oldestActiveIngestedAt: oldest?.[0]?.last_ingested_at ?? null,
  });
}
