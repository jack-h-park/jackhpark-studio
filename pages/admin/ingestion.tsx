import type { GetServerSideProps } from "next";
import type { JSX } from "react";
import { FiPlayCircle } from "@react-icons/all-files/fi/FiPlayCircle";
import Head from "next/head";
import { type ExtendedRecordMap } from "notion-types";

import type {
  DatasetSnapshotOverview,
  RecentRunsSnapshot,
  SystemHealthOverview,
} from "@/lib/admin/ingestion-types";
import { ManualIngestionPanel } from "@/components/admin/ingestion/ManualIngestionPanel";
import { RagDocumentsOverview } from "@/components/admin/ingestion/RagDocumentsOverview";
import { RecentRunsSection } from "@/components/admin/ingestion/RecentRunsSection";
import { SnapshotPreviewPanel } from "@/components/admin/ingestion/SnapshotPreviewPanel";
import { SystemHealthSection } from "@/components/admin/ingestion/SystemHealthSection";
import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { IngestionSubNav } from "@/components/admin/navigation/IngestionSubNav";
import { AiPageChrome } from "@/components/AiPageChrome";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import {
  SNAPSHOT_HISTORY_LIMIT,
  toSnapshotSummary,
} from "@/lib/admin/ingestion-formatters";
import { getStringMetadata } from "@/lib/admin/ingestion-metadata";
import {
  DEFAULT_RUNS_PAGE_SIZE,
  normalizeRunRecord,
  type RunRecord,
} from "@/lib/admin/ingestion-runs";
import {
  computeDocumentStats,
  normalizeRagDocument,
  type RagDocumentRecord,
  type RagDocumentStats,
} from "@/lib/admin/rag-documents";
import {
  normalizeSnapshotRecord,
  type SnapshotRecord,
} from "@/lib/admin/rag-snapshot";
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";
import {
  loadCanonicalPageLookup,
  resolvePublicPageUrl,
} from "@/lib/server/page-url";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const PAGE_TITLE = "Ingestion Dashboard";
const PAGE_TAB_TITLE = `Admin · ${PAGE_TITLE} — Jack H. Park`;

type PageProps = {
  datasetSnapshot: DatasetSnapshotOverview;
  systemHealth: SystemHealthOverview;
  recentRuns: RecentRunsSnapshot;
  headerRecordMap: ExtendedRecordMap | null;
  headerBlockId: string;
  documentsStats: RagDocumentStats | null;
  lifecycleSummary: {
    recentMissingCount: number;
    softDeletedCount: number;
    recentAuthErrorCount: number;
    recentWindowLabel: string;
  };
};

function IngestionDashboard({
  datasetSnapshot,
  systemHealth,
  recentRuns,
  headerRecordMap,
  headerBlockId,
  documentsStats,
  lifecycleSummary,
}: PageProps): JSX.Element {
  return (
    <>
      <Head>
        <title>{PAGE_TAB_TITLE}</title>
      </Head>

      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
      >
        <AdminPageShell
          section="ingestion"
          header={{
            icon: <FiPlayCircle aria-hidden="true" />,
            overline: "ADMIN · INGESTION",
            title: PAGE_TITLE,
            description:
              "Monitor ingestion health, trigger manual runs, and review the latest dataset snapshot.",
            actions: (
              <div className="flex flex-wrap items-center gap-2">
                <LinkButton href="/admin/documents" variant="outline">
                  Manage RAG Documents
                </LinkButton>
                <LinkButton href="/admin/chat-config" variant="outline">
                  Chat Configuration
                </LinkButton>
              </div>
            ),
          }}
        >
          <div className="mb-6 space-y-6">
            <IngestionSubNav />
            <ManualIngestionPanel />
            <SnapshotPreviewPanel overview={datasetSnapshot} />
            <RagDocumentsOverview stats={documentsStats} />
            <Card>
              <CardHeader>
                <CardTitle>Lifecycle Summary</CardTitle>
                <CardDescription>
                  Signals from recent document sync attempts.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-md border border-[var(--ai-border-muted)] bg-[var(--ai-role-surface-muted)] p-3">
                  <p className="text-xs text-[var(--ai-text-muted)]">
                    Missing (recent {lifecycleSummary.recentWindowLabel})
                  </p>
                  <p className="text-lg font-semibold">
                    {lifecycleSummary.recentMissingCount.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md border border-[var(--ai-border-muted)] bg-[var(--ai-role-surface-muted)] p-3">
                  <p className="text-xs text-[var(--ai-text-muted)]">
                    Soft-deleted
                  </p>
                  <p className="text-lg font-semibold">
                    {lifecycleSummary.softDeletedCount.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md border border-[var(--ai-border-muted)] bg-[var(--ai-role-surface-muted)] p-3">
                  <p className="text-xs text-[var(--ai-text-muted)]">
                    401/403 (recent {lifecycleSummary.recentWindowLabel})
                  </p>
                  <p className="text-lg font-semibold">
                    {lifecycleSummary.recentAuthErrorCount.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
            <SystemHealthSection health={systemHealth} />
            <RecentRunsSection initial={recentRuns} />
          </div>
        </AdminPageShell>
      </AiPageChrome>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (
  _context,
  // No changes needed here for now, filtering will be client-driven
) => {
  const headerRecordMapPromise = loadNotionNavigationHeader();

  const supabase = getSupabaseAdminClient();
  const pageSize = DEFAULT_RUNS_PAGE_SIZE;
  const canonicalLookup = await loadCanonicalPageLookup();

  const { data: snapshotRows } = await supabase
    .from("rag_snapshot")
    .select(
      "id, captured_at, schema_version, run_id, run_status, run_started_at, run_ended_at, run_duration_ms, run_error_count, run_documents_skipped, embedding_provider, ingestion_mode, total_documents, total_chunks, total_characters, delta_documents, delta_chunks, delta_characters, error_count, skipped_documents, queue_depth, retry_count, pending_runs, metadata",
    )
    .order("captured_at", { ascending: false })
    .limit(SNAPSHOT_HISTORY_LIMIT);

  const { data: runsData, count: runsCount } = await supabase
    .from("rag_ingest_runs")
    .select(
      "id, source, ingestion_type, partial_reason, status, started_at, ended_at, duration_ms, documents_processed, documents_added, documents_updated, documents_skipped, chunks_added, chunks_updated, characters_added, characters_updated, error_count, error_logs, metadata",
      { count: "exact" },
    )
    .order("started_at", { ascending: false })
    .range(0, pageSize - 1);

  const runs: RunRecord[] = (runsData ?? []).map((run: unknown) =>
    normalizeRunRecord(run),
  );
  for (const run of runs) {
    const pageId = getStringMetadata(run.metadata, "pageId");
    const publicUrl = resolvePublicPageUrl(pageId, canonicalLookup);
    if (publicUrl) {
      run.metadata = {
        ...run.metadata,
        publicPageUrl: publicUrl,
      };
    }
  }
  const totalCount = runsCount ?? runs.length;
  const totalPages =
    pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const snapshotRecords: SnapshotRecord[] = (snapshotRows ?? [])
    .map((row: unknown) => normalizeSnapshotRecord(row))
    .filter(
      (entry: SnapshotRecord | null): entry is SnapshotRecord => entry !== null,
    );

  const snapshotSummaries = snapshotRecords.map((snapshot) =>
    toSnapshotSummary(snapshot),
  );

  const datasetSnapshot: DatasetSnapshotOverview = {
    latest: snapshotSummaries[0] ?? null,
    history: snapshotSummaries,
  };

  const latestSnapshotRecord = snapshotRecords[0] ?? null;
  const latestRun = runs[0] ?? null;
  const lastFailureRun =
    runs.find(
      (run) =>
        run.status === "failed" || run.status === "completed_with_errors",
    ) ?? null;

  const { data: statsData, error: statsError } = await supabase
    .from("rag_documents")
    .select("doc_id, metadata")
    .order("last_ingested_at", { ascending: false })
    .limit(2000);

  const { data: docsData, error: docsError } = await supabase
    .from("rag_documents")
    .select("doc_id, status, last_sync_attempt_at, last_fetch_status")
    .order("last_ingested_at", { ascending: false })
    .limit(2000);

  const documentsStats = statsError
    ? null
    : computeDocumentStats(
        (statsData ?? [])
          .map((row: unknown) => normalizeRagDocument(row))
          .filter(
            (doc: RagDocumentRecord | null): doc is RagDocumentRecord =>
              doc !== null && typeof doc.doc_id === "string",
          ),
      );

  const normalizedDocs: RagDocumentRecord[] = docsError
    ? []
    : (docsData ?? [])
        .map((row: unknown) => normalizeRagDocument(row))
        .filter(
          (doc: RagDocumentRecord | null): doc is RagDocumentRecord =>
            doc !== null && typeof doc.doc_id === "string",
        );

  const recentWindowDays = 7;
  const recentWindowMs = recentWindowDays * 24 * 60 * 60 * 1000;
  const cutoffMs = Date.now() - recentWindowMs;
  const recentAttempts = normalizedDocs.filter((doc) => {
    if (!doc.last_sync_attempt_at) return false;
    const ts = new Date(doc.last_sync_attempt_at).getTime();
    return Number.isFinite(ts) && ts >= cutoffMs;
  });
  const recentMissingCount = recentAttempts.filter(
    (doc) => doc.status === "missing",
  ).length;
  const softDeletedCount = normalizedDocs.filter(
    (doc) => doc.status === "soft_deleted",
  ).length;
  const recentAuthErrorCount = recentAttempts.filter(
    (doc) => doc.last_fetch_status === 401 || doc.last_fetch_status === 403,
  ).length;

  const systemHealth: SystemHealthOverview = {
    runId: latestSnapshotRecord?.runId ?? latestRun?.id ?? null,
    status:
      latestSnapshotRecord?.runStatus ??
      (latestRun ? latestRun.status : "unknown"),
    startedAt:
      latestSnapshotRecord?.runStartedAt ?? latestRun?.started_at ?? null,
    endedAt: latestSnapshotRecord?.runEndedAt ?? latestRun?.ended_at ?? null,
    durationMs:
      latestSnapshotRecord?.runDurationMs ?? latestRun?.duration_ms ?? null,
    errorCount:
      latestSnapshotRecord?.errorCount ??
      latestSnapshotRecord?.runErrorCount ??
      latestRun?.error_count ??
      null,
    documentsSkipped:
      latestSnapshotRecord?.skippedDocuments ??
      latestSnapshotRecord?.runDocumentsSkipped ??
      latestRun?.documents_skipped ??
      null,
    queueDepth: latestSnapshotRecord?.queueDepth ?? null,
    retryCount: latestSnapshotRecord?.retryCount ?? null,
    pendingRuns: latestSnapshotRecord?.pendingRuns ?? null,
    lastFailureRunId: lastFailureRun?.id ?? null,
    lastFailureAt:
      lastFailureRun?.ended_at ?? lastFailureRun?.started_at ?? null,
    lastFailureStatus: lastFailureRun?.status ?? null,
    snapshotCapturedAt: latestSnapshotRecord?.capturedAt ?? null,
  };

  const { headerRecordMap, headerBlockId } = await headerRecordMapPromise;

  return {
    props: {
      datasetSnapshot,
      systemHealth,
      recentRuns: {
        runs,
        page: 1,
        pageSize,
        totalCount,
        totalPages,
      },
      headerRecordMap,
      headerBlockId,
      documentsStats,
      lifecycleSummary: {
        recentMissingCount,
        softDeletedCount,
        recentAuthErrorCount,
        recentWindowLabel: `${recentWindowDays}d`,
      },
    },
  };
};

export default IngestionDashboard;
