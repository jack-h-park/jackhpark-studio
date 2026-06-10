import { type ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import type { ModelProvider } from "../shared/model-provider";
import { resolveEmbeddingSpace } from "../core/embedding-spaces";
import { supabaseClient } from "../core/supabase";
import { getSiteConfig } from "../get-config-value";
import { notion } from "../notion-api";
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
  type IngestDocumentOutcome,
  ingestPreparedDocument,
  type IngestProgressStep,
  type IngestReporter,
} from "../rag/pipeline";
import { markAttempt, markFetchFailure } from "../rag/ragDocumentLifecycle";
import {
  deriveNotionDocIdentifiers,
  prepareNotionPageDocument,
} from "../rag/sources/notion";
import { fetchUrlDocument } from "../rag/sources/url";

type ManualNotionScope = "workspace" | "selected";

const LINKED_PAGE_MAX_PAGES = 250;
const LINKED_PAGE_MAX_DEPTH = 4;

// Notion sometimes returns doubly-nested blocks: recordMap.block[id].value = { role, value: Block }.
// Unwrap until we find an object with an `id` field (the actual Block).
// https://github.com/NotionX/react-notion-x/issues/682
function unwrapBlock(
  blockEntry: ExtendedRecordMap["block"][string] | undefined,
): Record<string, unknown> | undefined {
  if (!blockEntry) return undefined;
  let v: unknown = blockEntry.value;
  while (v && typeof v === "object" && !(v as Record<string, unknown>).id) {
    v = (v as Record<string, unknown>).value;
  }
  if (!v || typeof v !== "object") return undefined;
  return v as Record<string, unknown>;
}

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
  | (ManualIngestionBase & { mode: "url"; url: string });

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

async function collectLinkedPagesFromSeeds(
  seedPageIds: string[],
  emit: EmitFn,
): Promise<string[]> {
  const seen = new Set<string>();
  const queue: Array<{ pageId: string; depth: number }> = [];

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
      recordMap = await notion.getPage(pageId);
    } catch {
      continue;
    }
    if (!recordMap) continue;

    // Collect collection_view blocks to fetch in parallel after sync block scan
    const collectionViews: Array<{ collectionId: string; viewId: string }> = [];

    for (const block of Object.values(recordMap.block ?? {})) {
      const value = unwrapBlock(block);
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
        if (collectionId && viewId) collectionViews.push({ collectionId, viewId });
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
      await Promise.all(
        collectionViews.map(async ({ collectionId, viewId }) => {
          if (seen.size >= LINKED_PAGE_MAX_PAGES) return;
          try {
            const collData = await notion.getCollectionData(
              collectionId,
              viewId,
              { limit: LINKED_PAGE_MAX_PAGES },
            );
            const rowIds =
              (collData as unknown as { allBlockIds?: string[] })
                .allBlockIds ?? collData.result.blockIds ?? [];
            for (const rowId of rowIds) {
              if (seen.size >= LINKED_PAGE_MAX_PAGES) break;
              const normalizedRow = normalizeNotionPageId(rowId);
              if (!normalizedRow || seen.has(normalizedRow)) continue;
              seen.add(normalizedRow);
              // Database rows are leaf pages — add to seen but skip BFS expansion
            }
          } catch {
            // ignore individual collection errors
          }
        }),
      );
      await emit({
        type: "log",
        level: "info",
        message: `${seen.size} pages discovered so far.`,
      });
    }
  }

  return Array.from(seen);
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
  emit,
}: {
  scope?: ManualNotionScope;
  pageId?: string;
  pageIds?: string[];
  ingestionType: "full" | "partial";
  includeLinkedPages?: boolean;
  embeddingOptions: EmbedBatchOptions;
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
    source: "manual/notion-page",
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
      workspacePageIds = await collectLinkedPagesFromSeeds([rootPageId], emit);
      if (workspacePageIds.length === 0) {
        workspacePageIds = [rootPageId];
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to enumerate workspace pages.";
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
      linkedPageIds = await collectLinkedPagesFromSeeds(
        seedList.length > 0 ? seedList : [rootPageId],
        emit,
      );
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

  const processedPages: string[] = [];

  try {
    for (let index = 0; index < candidatePages.length; index += 1) {
      const candidate = candidatePages[index]!;
      const currentPageId = candidate.pageId;

      if (processedPages.includes(currentPageId)) {
        continue;
      }
      processedPages.push(currentPageId);

      let recordMap: ExtendedRecordMap | null = null;

      const { canonicalId } = deriveNotionDocIdentifiers(currentPageId);

      try {
        await markAttempt(supabaseClient, canonicalId);
        await emit({
          type: "log",
          level: "info",
          message: `Fetching Notion page ${currentPageId}...`,
        });

        recordMap = await notion.getPage(currentPageId);
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
        continue;
      }

      if (!recordMap) {
        stats.documentsSkipped += 1;
        await emit({
          type: "log",
          level: "warn",
          message: `Unable to load Notion page ${currentPageId}; skipping.`,
        });
        continue;
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
        continue;
      }

      const title = getPageTitle(recordMap, currentPageId);

      await emit({
        type: "queue",
        current: index + 1,
        total: candidatePages.length,
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
    }

    const updatedPages = stats.documentsAdded + stats.documentsUpdated;
    const skippedPages = stats.documentsSkipped;

    if (status === "success") {
      if (requestedScope === "workspace") {
        finalMessage =
          processedPages.length === 0
            ? "No Notion pages were available to ingest."
            : stats.errorCount > 0
              ? `Manual Notion ingestion completed with failures (${stats.errorCount}).`
              : `Processed ${processedPages.length} Notion page(s) workspace-wide; updated ${updatedPages}, skipped ${skippedPages}.`;
      } else if (includeLinkedPages) {
        finalMessage =
          processedPages.length === 0
            ? "No Notion pages were available to ingest."
            : stats.errorCount > 0
              ? `Manual Notion ingestion completed with failures (${stats.errorCount}).`
              : `Processed ${processedPages.length} Notion page(s); updated ${updatedPages}, skipped ${skippedPages}.`;
      } else {
        finalMessage =
          updatedPages > 0
            ? "Manual Notion page ingestion finished."
            : "Manual Notion page ingestion found no changes.";
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
    });
  }
}

async function runUrlIngestion(
  url: string,
  ingestionType: "full" | "partial",
  embeddingOptions: EmbedBatchOptions,
  emit: EmitFn,
): Promise<void> {
  const parsedUrl = new URL(url);
  const runHandle: IngestRunHandle = await startIngestRun({
    source: "manual/url",
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
      emit,
    });
    return;
  }

  const ingestionType = request.ingestionType ?? "partial";
  await runUrlIngestion(request.url, ingestionType, embeddingOptions, emit);
}
