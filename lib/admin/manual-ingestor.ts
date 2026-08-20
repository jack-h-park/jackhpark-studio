import { type ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";
import pMap from "p-map";

import type { ModelProvider } from "../shared/model-provider";
import { resolveEmbeddingSpace } from "../core/embedding-spaces";
import { supabaseClient } from "../core/supabase";
import { getSiteConfig } from "../get-config-value";
import { notion } from "../notion-api";
import { withRateLimitRetry } from "../notion-rate-limit";
import {
  createEmptyRunStats,
  type EmbedBatchOptions,
  finishIngestRun,
  getPageTitle,
  getPageUrl,
  type IngestRunErrorLog,
  type IngestRunHandle,
  type IngestRunStats,
  startIngestRun,
} from "../rag/index";
import {
  appendSweepRunLogs,
  formatSweepSummary,
  sweepUnvisitedDocuments,
} from "../rag/missing-sweep";
import { unwrapRecordValue } from "../rag/notion-record-value";
import {
  type IngestDocumentOutcome,
  ingestPreparedDocument,
  type IngestProgressStep,
  type IngestReporter,
} from "../rag/pipeline";
import { markAttempt, markFetchFailure } from "../rag/rag-document-lifecycle";
import {
  fetchInterviewBankCards,
  INTERVIEW_BANK_SOURCE_URL_PREFIX,
  prepareInterviewCardDocument,
} from "../rag/sources/interview-bank";
import {
  deriveNotionDocIdentifiers,
  prepareNotionPageDocument,
} from "../rag/sources/notion";
import { fetchUrlDocument } from "../rag/sources/url";

type ManualNotionScope = "workspace" | "selected";

const LINKED_PAGE_MAX_PAGES = 250;
const LINKED_PAGE_MAX_DEPTH = 4;

/**
 * How many pages to ingest at once.
 *
 * Kept low on purpose. Notion 429s even at concurrency 1 on a long traversal (see
 * `withRateLimitRetry`), and every retry costs more wall-clock than the parallelism saves,
 * so this trades a small speedup for a rate-limit budget rather than chasing throughput.
 * Ingestion is a background job in every caller; nothing waits on it interactively.
 */
const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? "2", 10),
);

let _workspaceRootPageId: string | undefined;

function getWorkspaceRootPageId(): string {
  if (_workspaceRootPageId) {
    return _workspaceRootPageId;
  }

  const candidate =
    process.env.NOTION_ROOT_PAGE_ID ?? getSiteConfig("rootNotionPageId");
  const normalized =
    typeof candidate === "string"
      ? parsePageId(candidate, { uuid: true })
      : undefined;

  if (!normalized) {
    throw new Error(
      "Missing Notion root page ID. Set NOTION_ROOT_PAGE_ID or configure rootNotionPageId in site.config.ts.",
    );
  }

  _workspaceRootPageId = normalized;
  return normalized;
}

function normalizeNotionPageId(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const sanitized = parsePageId(value, { uuid: true });
  if (sanitized) {
    return sanitized;
  }

  const fallback = value.replaceAll("-", "");
  return fallback.length === 32 ? fallback : undefined;
}

type ManualIngestionBase = {
  /**
   * Where this run came from, recorded as the ingest run's `source`.
   *
   * The admin runs list builds its source filter from the distinct values seen, so a caller
   * that supplies its own label becomes filterable without a schema change. Defaults keep
   * admin-initiated runs on the values they have always used.
   */
  source?: string;
  /**
   * Epoch ms after which no further page is started.
   *
   * For callers that run under a hard external timeout (a serverless cron), where being
   * killed mid-loop would leave the run row `in_progress` for ever and the operator with no
   * idea how much was covered. Pages already in flight finish; the rest are reported as not
   * reached. Ingestion is per-page and idempotent, so the next run simply continues.
   */
  deadlineAt?: number;
  ingestionType?: "full" | "partial";
  embeddingProvider?: ModelProvider;
  embeddingModel?: string | null;
  embeddingModelId?: string | null;
  embeddingSpaceId?: string | null;
  embeddingVersion?: string | null;
};

export type ManualIngestionRequest =
  | (ManualIngestionBase & {
      mode: "notion_page";
      scope?: ManualNotionScope;
      pageId?: string;
      pageIds?: string[];
      includeLinkedPages?: boolean;
    })
  | (ManualIngestionBase & { mode: "url"; url: string })
  | (ManualIngestionBase & { mode: "interview_bank" });

export type ManualIngestionEvent =
  | { type: "run"; runId: string | null }
  | { type: "log"; message: string; level?: "info" | "warn" | "error" }
  | { type: "progress"; step: string; percent: number }
  | {
      type: "queue";
      current: number;
      total: number;
      pageId: string;
      title: string | null;
    }
  | {
      type: "complete";
      status: "success" | "completed_with_errors" | "failed";
      message?: string;
      runId: string | null;
      stats: IngestRunStats;
      /** Pages skipped because `deadlineAt` passed. Absent or 0 means the run was complete. */
      pagesNotReached?: number;
    };

type EmitFn = (event: ManualIngestionEvent) => Promise<void> | void;
type ManualRunStatus = "success" | "completed_with_errors" | "failed";

const DEFAULT_EMBEDDING_SELECTION = resolveEmbeddingSpace({
  embeddingSpaceId: process.env.EMBEDDING_SPACE_ID ?? null,
  embeddingModelId: process.env.EMBEDDING_MODEL ?? null,
  provider: process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER ?? null,
  version: process.env.EMBEDDING_VERSION ?? null,
});

function toEmbeddingOptions(
  request: ManualIngestionRequest,
): EmbedBatchOptions {
  const selection = resolveEmbeddingSpace({
    embeddingSpaceId:
      request.embeddingSpaceId ?? DEFAULT_EMBEDDING_SELECTION.embeddingSpaceId,
    embeddingModelId:
      request.embeddingModel ?? request.embeddingModelId ?? undefined,
    provider: request.embeddingProvider ?? DEFAULT_EMBEDDING_SELECTION.provider,
    model: request.embeddingModel ?? undefined,
    version:
      request.embeddingVersion ??
      DEFAULT_EMBEDDING_SELECTION.version ??
      undefined,
  });

  return {
    provider: selection.provider,
    model: selection.model,
    embeddingModelId: selection.embeddingModelId,
    embeddingSpaceId: selection.embeddingSpaceId,
    version: selection.version,
  };
}

export interface LinkedPageDiscovery {
  pageIds: string[];
  /**
   * False when the traversal is known to have missed pages: the cap stopped
   * it early, or a page/collection fetch failed and was skipped.
   *
   * Callers that delete on absence must check this. A crawl that gave up on
   * one page returns a shorter list, not an error, and "shorter" is
   * indistinguishable from "those pages were deleted" — which is how a
   * transient 429 can mark a corpus missing.
   */
  complete: boolean;
}

// Exported for read-only tooling (scripts/report-notion-images.ts) that needs
// the same workspace discovery as manual ingestion: BFS over child pages,
// links, aliases, and collection rows.
export async function collectLinkedPagesFromSeeds(
  seedPageIds: string[],
  emit: EmitFn,
): Promise<LinkedPageDiscovery> {
  const seen = new Set<string>();
  const queue: Array<{ pageId: string; depth: number }> = [];
  let complete = true;

  for (const pageId of seedPageIds) {
    const normalized = normalizeNotionPageId(pageId);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    queue.push({ pageId: normalized, depth: 0 });
    if (seen.size >= LINKED_PAGE_MAX_PAGES) break;
  }

  while (queue.length > 0 && seen.size < LINKED_PAGE_MAX_PAGES) {
    const { pageId, depth } = queue.shift()!;
    if (depth >= LINKED_PAGE_MAX_DEPTH) continue;

    let recordMap: ExtendedRecordMap | null = null;
    try {
      recordMap = await withRateLimitRetry(() => notion.getPage(pageId));
    } catch (err) {
      // The subtree behind this page is now unreachable, so the traversal is
      // no longer a complete picture of the workspace.
      complete = false;
      await emit({
        type: "log",
        level: "warn",
        message: `Could not read page ${pageId} during discovery: ${
          err instanceof Error ? err.message : String(err)
        }. Pages below it were not visited.`,
      });
      continue;
    }
    if (!recordMap) {
      complete = false;
      continue;
    }

    // Collect collection_view blocks to fetch in parallel after sync block scan
    const collectionViews: Array<{ collectionId: string; viewId: string }> = [];

    for (const block of Object.values(recordMap.block ?? {})) {
      const value = unwrapRecordValue(block);
      if (!value || value.alive === false) continue;

      const type = value.type as string | undefined;
      let candidateId: string | undefined;

      if (type === "link_to_page") {
        candidateId = (value.link_to_page as { page_id?: string } | undefined)
          ?.page_id;
      } else if (type === "alias") {
        candidateId = (
          value.format as { alias_pointer?: { id?: string } } | undefined
        )?.alias_pointer?.id;
      } else if (
        type === "child_page" ||
        type === "child_database" ||
        type === "page"
      ) {
        if (typeof value.id === "string") candidateId = value.id;
      } else if (
        type === "collection_view" ||
        type === "collection_view_page"
      ) {
        const collectionId = value.collection_id as string | undefined;
        const viewId = (value.view_ids as string[] | undefined)?.[0];
        if (collectionId && viewId)
          collectionViews.push({ collectionId, viewId });
        continue;
      }

      if (!candidateId) continue;
      const normalizedCandidate = normalizeNotionPageId(candidateId);
      if (!normalizedCandidate || seen.has(normalizedCandidate)) continue;
      seen.add(normalizedCandidate);
      if (seen.size >= LINKED_PAGE_MAX_PAGES) break;
      queue.push({ pageId: normalizedCandidate, depth: depth + 1 });
    }

    // Fetch all databases on this page in parallel
    if (collectionViews.length > 0 && seen.size < LINKED_PAGE_MAX_PAGES) {
      await emit({
        type: "log",
        level: "info",
        message: `Scanning ${collectionViews.length} database(s) on page ${pageId}...`,
      });
      // Each fetch reports whether it reached its rows; `complete` is folded in
      // after the batch rather than written from inside the loop.
      const reached = await Promise.all(
        collectionViews.map(async ({ collectionId, viewId }) => {
          if (seen.size >= LINKED_PAGE_MAX_PAGES) return true;
          try {
            const collData = await withRateLimitRetry(() =>
              notion.getCollectionData(collectionId, viewId, {
                limit: LINKED_PAGE_MAX_PAGES,
              }),
            );
            const rowIds =
              (collData as unknown as { allBlockIds?: string[] }).allBlockIds ??
              collData.result.blockIds ??
              [];
            for (const rowId of rowIds) {
              if (seen.size >= LINKED_PAGE_MAX_PAGES) break;
              const normalizedRow = normalizeNotionPageId(rowId);
              if (!normalizedRow || seen.has(normalizedRow)) continue;
              seen.add(normalizedRow);
              // Database rows are leaf pages — add to seen but skip BFS expansion
            }
            return true;
          } catch (err) {
            // Every row of this database is now unvisited.
            await emit({
              type: "log",
              level: "warn",
              message: `Could not read database ${collectionId} on page ${pageId}: ${
                err instanceof Error ? err.message : String(err)
              }. Its rows were not visited.`,
            });
            return false;
          }
        }),
      );
      if (reached.includes(false)) complete = false;
      await emit({
        type: "log",
        level: "info",
        message: `${seen.size} pages discovered so far.`,
      });
    }
  }

  return {
    pageIds: Array.from(seen),
    // At the cap the BFS stopped early, so unvisited docs may be beyond the
    // cap rather than deleted.
    complete: complete && seen.size < LINKED_PAGE_MAX_PAGES,
  };
}

function buildReporter(
  emit: EmitFn,
  progressPercent: Record<IngestProgressStep, number>,
): IngestReporter {
  return {
    log: (level, message) => emit({ type: "log", level, message }),
    progress: (step) =>
      emit({ type: "progress", step, percent: progressPercent[step] }),
  };
}

const NOTION_PROGRESS_PERCENT: Record<IngestProgressStep, number> = {
  processing: 35,
  embedding: 60,
  saving: 85,
};

const URL_PROGRESS_PERCENT: Record<IngestProgressStep, number> = {
  processing: 45,
  embedding: 65,
  saving: 85,
};

async function ingestNotionPage({
  pageId,
  recordMap,
  ingestionType,
  stats,
  emit,
  embeddingOptions,
}: {
  pageId: string;
  recordMap: ExtendedRecordMap;
  ingestionType: "full" | "partial";
  stats: IngestRunStats;
  emit: EmitFn;
  embeddingOptions: EmbedBatchOptions;
}): Promise<void> {
  const doc = prepareNotionPageDocument(recordMap, pageId);
  await emit({
    type: "log",
    level: "info",
    message: `Fetched Notion page "${doc.title}" (${pageId}).`,
  });
  await emit({
    type: "progress",
    step: "fetched",
    percent: 20,
  });

  await ingestPreparedDocument({
    doc,
    ingestionType,
    embedding: embeddingOptions,
    stats,
    reporter: buildReporter(emit, NOTION_PROGRESS_PERCENT),
  });
}

async function runNotionPageIngestion({
  scope,
  pageId,
  pageIds,
  ingestionType,
  includeLinkedPages = true,
  embeddingOptions,
  source = "manual/notion-page",
  deadlineAt,
  emit,
}: {
  scope?: ManualNotionScope;
  pageId?: string;
  pageIds?: string[];
  ingestionType: "full" | "partial";
  includeLinkedPages?: boolean;
  embeddingOptions: EmbedBatchOptions;
  source?: string;
  deadlineAt?: number;
  emit: EmitFn;
}): Promise<void> {
  const requestedScope =
    scope ?? (includeLinkedPages ? "workspace" : "selected");
  const isWorkspace = requestedScope === "workspace";
  const candidateRoot =
    pageId ??
    (Array.isArray(pageIds) && pageIds.length > 0 ? pageIds[0] : undefined);
  let rootPageId = normalizeNotionPageId(candidateRoot);

  if (!rootPageId && isWorkspace) {
    rootPageId = getWorkspaceRootPageId();
  }

  if (!rootPageId) {
    throw new Error(
      "Provide at least one Notion page ID when ingesting selected pages.",
    );
  }

  const pageUrl = getPageUrl(rootPageId);
  const isFull = ingestionType === "full";
  const runHandle: IngestRunHandle = await startIngestRun({
    source,
    ingestion_type: ingestionType,
    metadata: {
      pageId: rootPageId,
      pageUrl,
      ingestionType,
      scope: requestedScope,
      includeLinkedPages:
        requestedScope === "selected" ? includeLinkedPages : undefined,
      embeddingProvider: embeddingOptions.provider ?? null,
      embeddingSpaceId: embeddingOptions.embeddingSpaceId ?? null,
      embeddingModelId: embeddingOptions.embeddingModelId ?? null,
      embeddingVersion: embeddingOptions.version ?? null,
    },
  });

  await emit({ type: "run", runId: runHandle?.id ?? null });
  await emit({
    type: "progress",
    step: "initializing",
    percent: 5,
  });

  const stats = createEmptyRunStats();
  const errorLogs: IngestRunErrorLog[] = [];
  const started = Date.now();
  let status: ManualRunStatus = "success";
  let finalMessage =
    requestedScope === "workspace"
      ? isFull
        ? "Manual Notion full workspace ingestion finished."
        : "Manual Notion workspace ingestion finished."
      : includeLinkedPages
        ? isFull
          ? "Manual Notion full ingestion (linked pages) finished."
          : "Manual Notion ingestion (linked pages) finished."
        : isFull
          ? "Manual Notion page full ingestion finished."
          : "Manual Notion page ingestion finished.";

  type CandidatePage = {
    pageId: string;
  };

  const candidatePages: CandidatePage[] = [];
  const seen = new Set<string>();
  // True only when the workspace enumeration finished without falling back
  // and without hitting the page cap — the preconditions for the post-run
  // missing-document sweep to be safe.
  let workspaceTraversalComplete = false;

  const pushCandidate = (id: string) => {
    const normalized = normalizeNotionPageId(id) ?? id;
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidatePages.push({ pageId: normalized });
  };

  const seedCollector = new Set<string>();
  const addSeed = (value?: string) => {
    const normalized = normalizeNotionPageId(value);
    if (normalized) {
      seedCollector.add(normalized);
    }
  };
  if (Array.isArray(pageIds)) {
    for (const id of pageIds) {
      addSeed(id);
    }
  }
  addSeed(pageId);
  if (requestedScope === "selected" && seedCollector.size === 0) {
    seedCollector.add(rootPageId);
  }

  if (isWorkspace) {
    await emit({
      type: "log",
      level: "info",
      message: `Collecting all pages in the workspace starting from ${rootPageId}...`,
    });

    let workspacePageIds: string[] = [];
    try {
      const discovery = await collectLinkedPagesFromSeeds([rootPageId], emit);
      workspacePageIds = discovery.pageIds;
      if (workspacePageIds.length === 0) {
        workspacePageIds = [rootPageId];
      }
      // Only a traversal that reached everything can tell "deleted" from
      // "not visited", and only it may drive the sweep below.
      workspaceTraversalComplete = discovery.complete;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to enumerate workspace pages.";
      await emit({
        type: "log",
        level: "warn",
        message: `Could not enumerate workspace pages: ${message}. Falling back to the root page only.`,
      });
      workspacePageIds = [rootPageId];
    }
    await emit({ type: "progress", step: "collected", percent: 15 });

    for (const pageId of workspacePageIds) {
      pushCandidate(pageId);
    }
  } else if (includeLinkedPages) {
    const seedList = Array.from(seedCollector);
    await emit({
      type: "log",
      level: "info",
      message: `Discovering linked Notion pages starting from ${rootPageId}...`,
    });

    let linkedPageIds: string[] = [];
    try {
      ({ pageIds: linkedPageIds } = await collectLinkedPagesFromSeeds(
        seedList.length > 0 ? seedList : [rootPageId],
        emit,
      ));
      if (linkedPageIds.length === 0) {
        linkedPageIds = seedList.length > 0 ? seedList : [rootPageId];
      }
      await emit({
        type: "log",
        level: "info",
        message: `Identified ${linkedPageIds.length} page(s) for ingestion.`,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to enumerate linked pages.";
      await emit({
        type: "log",
        level: "warn",
        message: `Could not enumerate linked pages: ${message}. Falling back to the selected page(s) only.`,
      });
      linkedPageIds = seedList.length > 0 ? seedList : [rootPageId];
    }

    for (const linkedId of linkedPageIds) {
      pushCandidate(linkedId);
    }
  } else {
    const seedList = Array.from(seedCollector);
    if (seedList.length === 0) {
      seedList.push(rootPageId);
    }
    for (const seedId of seedList) {
      pushCandidate(seedId);
    }
  }

  if (candidatePages.length === 0) {
    pushCandidate(rootPageId);
  }

  if (isWorkspace) {
    await emit({
      type: "log",
      level: "info",
      message: `Identified ${candidatePages.length} page(s) for workspace ingestion.`,
    });
  } else if (!includeLinkedPages) {
    await emit({
      type: "log",
      level: "info",
      message: `Identified ${candidatePages.length} selected page(s) for ingestion.`,
    });
  }

  // Deduplicate up front: the traversal can surface the same page by more than one route,
  // and with pages in flight concurrently a running "have I seen this" list would race.
  const seenPageIds = new Set<string>();
  const uniquePages = candidatePages.filter((candidate) => {
    if (seenPageIds.has(candidate.pageId)) return false;
    seenPageIds.add(candidate.pageId);
    return true;
  });

  // `queue.current` reports how many pages have been picked up, not an index, because
  // completion order is no longer the traversal order.
  let queuePosition = 0;
  let pagesNotReached = 0;

  try {
    await pMap(
      uniquePages,
      async (candidate) => {
        const currentPageId = candidate.pageId;

        // Checked per page rather than cancelling the pool: a page already fetched should
        // finish and be recorded, and stopping cleanly is what keeps the run row honest.
        if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
          pagesNotReached += 1;
          return;
        }

        let recordMap: ExtendedRecordMap | null = null;

        const { canonicalId } = deriveNotionDocIdentifiers(currentPageId);

        try {
          await markAttempt(supabaseClient, canonicalId);
          await emit({
            type: "log",
            level: "info",
            message: `Fetching Notion page ${currentPageId}...`,
          });

          // Retry 429s rather than dropping the page: a page skipped here leaves the corpus
          // silently short, which is exactly the failure this job exists to prevent.
          recordMap = await withRateLimitRetry(() =>
            notion.getPage(currentPageId),
          );
        } catch (err) {
          stats.errorCount += 1;
          const message = err instanceof Error ? err.message : String(err);
          errorLogs.push({
            context: "fatal",
            doc_id: currentPageId,
            message,
          });
          await markFetchFailure(supabaseClient, canonicalId, err);
          await emit({
            type: "log",
            level: "error",
            message: `Failed to load Notion page ${currentPageId}: ${message}`,
          });
          return;
        }

        if (!recordMap) {
          stats.documentsSkipped += 1;
          await emit({
            type: "log",
            level: "warn",
            message: `Unable to load Notion page ${currentPageId}; skipping.`,
          });
          return;
        }

        if (Object.keys(recordMap.block ?? {}).length === 0) {
          stats.errorCount += 1;
          const apiBaseUrl =
            process.env.NOTION_API_BASE_URL ?? "https://www.notion.so/api/v3";
          await emit({
            type: "log",
            level: "error",
            message: `Notion API returned no data for page ${currentPageId}. Check that NOTION_API_BASE_URL is correct (currently: ${apiBaseUrl}). The page may be private or the endpoint may be unreachable.`,
          });
          return;
        }

        const title = getPageTitle(recordMap, currentPageId);

        queuePosition += 1;
        await emit({
          type: "queue",
          current: queuePosition,
          total: uniquePages.length,
          pageId: currentPageId,
          title: title ?? null,
        });

        try {
          await ingestNotionPage({
            pageId: currentPageId,
            recordMap,
            ingestionType,
            stats,
            emit,
            embeddingOptions,
          });
        } catch (err) {
          stats.errorCount += 1;
          const message = err instanceof Error ? err.message : String(err);
          errorLogs.push({
            context: "fatal",
            doc_id: currentPageId,
            message,
          });
          await emit({
            type: "log",
            level: "error",
            message: `Failed to ingest Notion page ${currentPageId}: ${message}`,
          });
        }
      },
      { concurrency: INGEST_CONCURRENCY },
    );

    // Full workspace runs only: deleted pages vanish from the traversal
    // without a 404, so sweep still-"active" docs the run never visited.
    // Selected/partial runs and incomplete traversals must never sweep.
    if (isFull && isWorkspace && workspaceTraversalComplete) {
      const sweep = await sweepUnvisitedDocuments(supabaseClient, {
        runStartedAt: new Date(started).toISOString(),
      });
      appendSweepRunLogs(sweep, stats, errorLogs);
      await emit({
        type: "log",
        level: sweep.failures.length > 0 ? "warn" : "info",
        message: formatSweepSummary(sweep),
      });
    }

    const updatedPages = stats.documentsAdded + stats.documentsUpdated;
    const skippedPages = stats.documentsSkipped;

    if (status === "success") {
      if (requestedScope === "workspace") {
        finalMessage =
          uniquePages.length === 0
            ? "No Notion pages were available to ingest."
            : stats.errorCount > 0
              ? `Manual Notion ingestion completed with failures (${stats.errorCount}).`
              : `Processed ${uniquePages.length} Notion page(s) workspace-wide; updated ${updatedPages}, skipped ${skippedPages}.`;
      } else if (includeLinkedPages) {
        finalMessage =
          uniquePages.length === 0
            ? "No Notion pages were available to ingest."
            : stats.errorCount > 0
              ? `Manual Notion ingestion completed with failures (${stats.errorCount}).`
              : `Processed ${uniquePages.length} Notion page(s); updated ${updatedPages}, skipped ${skippedPages}.`;
      } else {
        finalMessage =
          updatedPages > 0
            ? "Manual Notion page ingestion finished."
            : "Manual Notion page ingestion found no changes.";
      }

      // A run cut short must not read as a clean sweep of the workspace.
      if (pagesNotReached > 0) {
        finalMessage = `${finalMessage} Deadline reached with ${pagesNotReached} page(s) not visited; the next run covers them.`;
        await emit({
          type: "log",
          level: "warn",
          message: `Deadline reached: ${pagesNotReached} of ${uniquePages.length} page(s) were not visited. This run is incomplete.`,
        });
      }
    }
  } catch (err) {
    status = "failed";
    stats.errorCount += 1;
    const message = err instanceof Error ? err.message : String(err);
    const failingPageId =
      (err as { ingestionPageId?: string | null })?.ingestionPageId ??
      rootPageId;
    const scopeLabel =
      requestedScope === "workspace"
        ? isFull
          ? "Manual Notion full workspace ingestion failed"
          : "Manual Notion workspace ingestion failed"
        : includeLinkedPages
          ? isFull
            ? "Manual Notion full ingestion (linked pages) failed"
            : "Manual Notion ingestion (linked pages) failed"
          : isFull
            ? "Manual Notion page full ingestion failed"
            : "Manual Notion ingestion failed";
    finalMessage = `${scopeLabel}: ${message}`;
    errorLogs.push({
      context: "fatal",
      doc_id: failingPageId,
      message,
    });
    await emit({
      type: "log",
      level: "error",
      message: finalMessage,
    });
  } finally {
    const durationMs = Date.now() - started;
    if (status === "failed" && stats.errorCount === 0) {
      stats.errorCount = 1;
    }

    if (stats.errorCount > 0 && status === "success") {
      status = "completed_with_errors";
    }

    await finishIngestRun(runHandle, {
      status,
      durationMs,
      totals: stats,
      errorLogs,
    });

    await emit({
      type: "progress",
      step: "finished",
      percent: 100,
    });
    await emit({
      type: "complete",
      status,
      message: finalMessage,
      runId: runHandle?.id ?? null,
      stats,
      pagesNotReached,
    });
  }
}

async function runUrlIngestion(
  url: string,
  ingestionType: "full" | "partial",
  embeddingOptions: EmbedBatchOptions,
  emit: EmitFn,
  source = "manual/url",
): Promise<void> {
  const parsedUrl = new URL(url);
  const runHandle: IngestRunHandle = await startIngestRun({
    source,
    ingestion_type: ingestionType,
    metadata: {
      url,
      hostname: parsedUrl.hostname,
      ingestionType,
      embeddingProvider: embeddingOptions.provider ?? null,
      embeddingSpaceId: embeddingOptions.embeddingSpaceId ?? null,
      embeddingModelId: embeddingOptions.embeddingModelId ?? null,
      embeddingVersion: embeddingOptions.version ?? null,
    },
  });

  await emit({ type: "run", runId: runHandle?.id ?? null });
  await emit({
    type: "progress",
    step: "initializing",
    percent: 5,
  });

  const stats = createEmptyRunStats();
  const errorLogs: IngestRunErrorLog[] = [];
  const started = Date.now();
  let status: ManualRunStatus = "success";
  let finalMessage =
    ingestionType === "full"
      ? "Manual URL full ingestion finished."
      : "Manual URL ingestion finished.";

  try {
    await emit({
      type: "log",
      level: "info",
      message: `Fetching ${url}...`,
    });
    const doc = await fetchUrlDocument(url);
    await emit({
      type: "progress",
      step: "fetched",
      percent: 25,
    });

    const outcome: IngestDocumentOutcome = await ingestPreparedDocument({
      doc,
      ingestionType,
      embedding: embeddingOptions,
      stats,
      reporter: buildReporter(emit, URL_PROGRESS_PERCENT),
    });

    if (outcome.action === "skipped") {
      finalMessage =
        outcome.reason === "empty-content"
          ? `No readable text extracted from ${url}; nothing ingested.`
          : outcome.reason === "unchanged"
            ? `No changes detected for ${doc.title} (${url}); skipping ingest.`
            : `Extracted content produced no chunks for ${url}; nothing stored.`;
    }
  } catch (err) {
    status = "failed";
    stats.errorCount += 1;
    const message = err instanceof Error ? err.message : String(err);
    finalMessage = `${
      ingestionType === "full"
        ? "Manual URL full ingestion failed"
        : "Manual URL ingestion failed"
    }: ${message}`;
    errorLogs.push({
      context: "fatal",
      doc_id: url,
      message,
    });
    await emit({
      type: "log",
      level: "error",
      message: finalMessage,
    });
  } finally {
    const durationMs = Date.now() - started;
    if (status === "failed" && stats.errorCount === 0) {
      stats.errorCount = 1;
    }

    if (stats.errorCount > 0 && status === "success") {
      status = "completed_with_errors";
    }

    await finishIngestRun(runHandle, {
      status,
      durationMs,
      totals: stats,
      errorLogs,
    });

    await emit({
      type: "progress",
      step: "finished",
      percent: 100,
    });
    await emit({
      type: "complete",
      status,
      message: finalMessage,
      runId: runHandle?.id ?? null,
      stats,
    });
  }
}

/**
 * Ingest the interview Q&A bank.
 *
 * Unlike the Notion path there is no traversal to be incomplete: the card list is the whole
 * directory, fetched in one call. So the sweep runs on every successful listing rather than
 * only on `full` runs — a card demoted below `reviewed`, or opted out, simply stops being
 * returned, and the sweep is what makes it stop being retrieved. (That only has an effect
 * once the status-filtered RPCs are enabled; see RAG_MATCH_RPC_VERSION.)
 */
async function runInterviewBankIngestion({
  ingestionType,
  embeddingOptions,
  source = "manual/interview-bank",
  emit,
}: {
  ingestionType: "full" | "partial";
  embeddingOptions: EmbedBatchOptions;
  source?: string;
  emit: EmitFn;
}): Promise<void> {
  const runHandle: IngestRunHandle = await startIngestRun({
    source,
    ingestion_type: ingestionType,
    metadata: {
      // Same key the Notion path uses for workspace/selected: "what did this run cover".
      // The freshness endpoint filters lanes on it, so a run without it is a run nothing
      // is watching.
      scope: "interview_bank",
      repo: process.env.INTERVIEW_BANK_REPO ?? null,
      ingestionType,
      embeddingProvider: embeddingOptions.provider ?? null,
      embeddingSpaceId: embeddingOptions.embeddingSpaceId ?? null,
      embeddingModelId: embeddingOptions.embeddingModelId ?? null,
      embeddingVersion: embeddingOptions.version ?? null,
    },
  });

  await emit({ type: "run", runId: runHandle?.id ?? null });
  await emit({ type: "progress", step: "initializing", percent: 5 });

  const stats = createEmptyRunStats();
  const errorLogs: IngestRunErrorLog[] = [];
  const started = Date.now();
  let status: ManualRunStatus = "success";
  let finalMessage = "Interview bank ingestion finished.";

  try {
    await emit({
      type: "log",
      level: "info",
      message: "Reading the interview Q&A bank from GitHub...",
    });

    const cards = await fetchInterviewBankCards();
    await emit({
      type: "log",
      level: "info",
      message: `${cards.length} card(s) are review-complete and opted in.`,
    });
    await emit({ type: "progress", step: "collected", percent: 20 });

    let position = 0;
    for (const card of cards) {
      position += 1;
      await emit({
        type: "queue",
        current: position,
        total: cards.length,
        pageId: card.slug,
        title: card.question,
      });

      try {
        await ingestPreparedDocument({
          doc: prepareInterviewCardDocument(card),
          ingestionType,
          embedding: embeddingOptions,
          stats,
          reporter: buildReporter(emit, URL_PROGRESS_PERCENT),
        });
      } catch (err) {
        stats.errorCount += 1;
        const message = err instanceof Error ? err.message : String(err);
        errorLogs.push({ context: "fatal", doc_id: card.slug, message });
        await emit({
          type: "log",
          level: "error",
          message: `Failed to ingest interview card ${card.slug}: ${message}`,
        });
      }
    }

    // Scoped to this source's URL prefix, so it can only ever retire interview cards.
    const sweep = await sweepUnvisitedDocuments(supabaseClient, {
      runStartedAt: new Date(started).toISOString(),
      sourceUrlPrefix: INTERVIEW_BANK_SOURCE_URL_PREFIX,
    });
    appendSweepRunLogs(sweep, stats, errorLogs);
    await emit({
      type: "log",
      level: "info",
      message: formatSweepSummary(sweep),
    });

    const updated = stats.documentsAdded + stats.documentsUpdated;
    finalMessage =
      cards.length === 0
        ? "No interview cards are review-complete and opted in; nothing ingested."
        : `Processed ${cards.length} interview card(s); updated ${updated}, skipped ${stats.documentsSkipped}.`;
  } catch (err) {
    status = "failed";
    stats.errorCount += 1;
    const message = err instanceof Error ? err.message : String(err);
    finalMessage = `Interview bank ingestion failed: ${message}`;
    errorLogs.push({ context: "fatal", doc_id: "interview-bank", message });
    await emit({ type: "log", level: "error", message: finalMessage });
  } finally {
    const durationMs = Date.now() - started;
    if (status === "failed" && stats.errorCount === 0) {
      stats.errorCount = 1;
    }
    if (stats.errorCount > 0 && status === "success") {
      status = "completed_with_errors";
    }

    await finishIngestRun(runHandle, {
      status,
      durationMs,
      totals: stats,
      errorLogs,
    });

    await emit({ type: "progress", step: "finished", percent: 100 });
    await emit({
      type: "complete",
      status,
      message: finalMessage,
      runId: runHandle?.id ?? null,
      stats,
    });
  }
}

export async function runManualIngestion(
  request: ManualIngestionRequest,
  emit: EmitFn,
): Promise<void> {
  const embeddingOptions = toEmbeddingOptions(request);

  if (request.mode === "notion_page") {
    const ingestionType = request.ingestionType ?? "partial";
    const includeLinkedPages = request.includeLinkedPages ?? true;
    const scope =
      request.scope ?? (includeLinkedPages ? "workspace" : "selected");
    await runNotionPageIngestion({
      scope,
      pageId: request.pageId,
      pageIds: request.pageIds,
      ingestionType,
      includeLinkedPages,
      embeddingOptions,
      source: request.source,
      deadlineAt: request.deadlineAt,
      emit,
    });
    return;
  }

  if (request.mode === "interview_bank") {
    await runInterviewBankIngestion({
      ingestionType: request.ingestionType ?? "partial",
      embeddingOptions,
      source: request.source,
      emit,
    });
    return;
  }

  const ingestionType = request.ingestionType ?? "partial";
  await runUrlIngestion(
    request.url,
    ingestionType,
    embeddingOptions,
    emit,
    request.source,
  );
}
