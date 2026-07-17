import type { SupabaseClient } from "@supabase/supabase-js";

import type { IngestRunErrorLog, IngestRunStats } from "./index";
import { debugIngestionLog } from "./debug";
import { markMissing } from "./rag-document-lifecycle";

const DOCUMENTS_TABLE = "rag_documents";

/** getPageUrl() prefix — restricts the sweep to Notion-sourced documents. */
export const NOTION_SOURCE_URL_PREFIX = "https://www.notion.so/";

/**
 * Safety valve: if more than this fraction of active documents would be
 * swept, assume the traversal was incomplete (rather than a mass deletion
 * in Notion) and skip. A real deletion wave is expected to be small.
 */
export const MAX_SWEEP_FRACTION = 0.25;

const SWEEP_ERROR_MESSAGE =
  "Not visited by full workspace ingestion run; presumed deleted at source";

export type MissingSweepCandidate = {
  doc_id: string;
  last_sync_attempt_at: string | null;
};

export type MissingSweepSkipReason =
  | "no-active-documents"
  | "no-visited-documents"
  | "nothing-to-sweep"
  | "threshold-exceeded"
  | "query-failed";

export type MissingSweepPlan =
  | { action: "sweep"; candidates: MissingSweepCandidate[] }
  | { action: "skip"; reason: MissingSweepSkipReason };

/**
 * Decide which active documents were NOT visited by the run that started at
 * `runStartedAt` (their last_sync_attempt_at predates the run or was never
 * set). Deleted Notion pages simply disappear from the workspace traversal,
 * so they are never individually fetched and would otherwise stay "active"
 * forever.
 *
 * Refuses to sweep when the result looks like a broken traversal instead of
 * a real deletion: nothing was visited at all, or the candidate set exceeds
 * `maxSweepFraction` of the active corpus.
 */
export function planMissingSweep({
  activeDocs,
  runStartedAt,
  maxSweepFraction = MAX_SWEEP_FRACTION,
}: {
  activeDocs: MissingSweepCandidate[];
  runStartedAt: string;
  maxSweepFraction?: number;
}): MissingSweepPlan {
  if (activeDocs.length === 0) {
    return { action: "skip", reason: "no-active-documents" };
  }

  const candidates = activeDocs.filter(
    (doc) =>
      doc.last_sync_attempt_at === null ||
      doc.last_sync_attempt_at < runStartedAt,
  );

  const visitedCount = activeDocs.length - candidates.length;
  if (visitedCount === 0) {
    return { action: "skip", reason: "no-visited-documents" };
  }

  if (candidates.length === 0) {
    return { action: "skip", reason: "nothing-to-sweep" };
  }

  if (candidates.length / activeDocs.length > maxSweepFraction) {
    return { action: "skip", reason: "threshold-exceeded" };
  }

  return { action: "sweep", candidates };
}

export type MissingSweepResult = {
  activeCount: number;
  candidateCount: number;
  sweptDocIds: string[];
  failures: Array<{ docId: string; message: string }>;
  skippedReason: MissingSweepSkipReason | null;
};

/**
 * Post-run sweep for FULL workspace ingestion runs: mark still-"active"
 * documents that the traversal never visited as missing. Callers must only
 * invoke this after a traversal that completed successfully and covered the
 * whole workspace — never after partial/single-page runs.
 *
 * Never throws; failures are reported in the result so a run's own status
 * handling stays in control.
 */
export async function sweepUnvisitedDocuments(
  supabase: SupabaseClient,
  {
    runStartedAt,
    sourceUrlPrefix = NOTION_SOURCE_URL_PREFIX,
    maxSweepFraction,
  }: {
    runStartedAt: string;
    sourceUrlPrefix?: string;
    maxSweepFraction?: number;
  },
): Promise<MissingSweepResult> {
  const result: MissingSweepResult = {
    activeCount: 0,
    candidateCount: 0,
    sweptDocIds: [],
    failures: [],
    skippedReason: null,
  };

  let activeDocs: MissingSweepCandidate[];
  try {
    const { data, error } = await supabase
      .from(DOCUMENTS_TABLE)
      .select("doc_id, last_sync_attempt_at")
      .eq("status", "active")
      .like("source_url", `${sourceUrlPrefix}%`);
    if (error) {
      throw error;
    }
    activeDocs = (data ?? []) as MissingSweepCandidate[];
  } catch (err) {
    console.warn("[rag:missing-sweep] failed to query active documents", {
      message: err instanceof Error ? err.message : String(err),
    });
    result.skippedReason = "query-failed";
    return result;
  }

  result.activeCount = activeDocs.length;
  const plan = planMissingSweep({ activeDocs, runStartedAt, maxSweepFraction });

  if (plan.action === "skip") {
    result.skippedReason = plan.reason;
    debugIngestionLog("missing-sweep-skipped", {
      reason: plan.reason,
      activeCount: activeDocs.length,
      runStartedAt,
    });
    return result;
  }

  result.candidateCount = plan.candidates.length;
  for (const candidate of plan.candidates) {
    const { statusUpdated } = await markMissing(
      supabase,
      candidate.doc_id,
      null,
      SWEEP_ERROR_MESSAGE,
    );
    if (statusUpdated) {
      result.sweptDocIds.push(candidate.doc_id);
    } else {
      result.failures.push({
        docId: candidate.doc_id,
        message: "markMissing did not update status",
      });
    }
  }

  debugIngestionLog("missing-sweep-complete", {
    activeCount: result.activeCount,
    candidateCount: result.candidateCount,
    sweptDocIds: result.sweptDocIds,
    failureCount: result.failures.length,
  });

  return result;
}

/** One-line human summary for run logs (CLI console / admin SSE stream). */
export function formatSweepSummary(result: MissingSweepResult): string {
  if (result.skippedReason) {
    return `Missing-document sweep skipped (${result.skippedReason}); active=${result.activeCount}.`;
  }
  if (result.candidateCount === 0) {
    return `Missing-document sweep: all ${result.activeCount} active document(s) visited; nothing to sweep.`;
  }
  const failureSuffix =
    result.failures.length > 0 ? `, ${result.failures.length} failed` : "";
  return `Missing-document sweep: marked ${result.sweptDocIds.length}/${result.candidateCount} unvisited document(s) as missing${failureSuffix}: ${result.sweptDocIds.join(", ")}`;
}

/**
 * Persist sweep outcome on the run record. Swept doc_ids are recorded as
 * error_logs entries under a "missing-sweep" context (rag_ingest_runs has no
 * dedicated column for them); only sweep FAILURES count toward errorCount.
 */
export function appendSweepRunLogs(
  result: MissingSweepResult,
  stats: IngestRunStats,
  errorLogs: IngestRunErrorLog[],
): void {
  for (const docId of result.sweptDocIds) {
    errorLogs.push({
      context: "missing-sweep",
      doc_id: docId,
      message: "Marked missing: not visited by this full ingestion run",
    });
  }
  for (const failure of result.failures) {
    stats.errorCount += 1;
    errorLogs.push({
      context: "missing-sweep-error",
      doc_id: failure.docId,
      message: failure.message,
    });
  }
}
