import { NotionAPI } from "notion-client";
import { type ExtendedRecordMap } from "notion-types";
import { getAllPagesInSpace, parsePageId } from "notion-utils";

import type { ModelProvider } from "../shared/model-provider";
import { resolveEmbeddingSpace } from "../core/embedding-spaces";
import { getSiteConfig } from "../get-config-value";
import { debugIngestionLog } from "../rag/debug";
import {
  chunkByTokens,
  type ChunkInsert,
  createEmptyRunStats,
  embedBatch,
  type EmbedBatchOptions,
  extractMainContent,
  extractPlainText,
  finishIngestRun,
  getDocumentState,
  getPageLastEditedTime,
  getPageTitle,
  getPageUrl,
  hasChunksForProvider,
  hashChunk,
  type IngestRunErrorLog,
  type IngestRunHandle,
  type IngestRunStats,
  replaceChunks,
  startIngestRun,
  upsertDocumentState,
} from "../rag/index";
import {
  decideIngestAction,
  isUnchanged,
  shouldSkipIngest,
} from "../rag/ingest-helpers";
import {
  applyDefaultDocMetadata,
  DEFAULT_INGEST_DOC_TYPE,
  DEFAULT_INGEST_PERSONA_TYPE,
  mergeMetadata,
  mergeRagDocumentMetadata,
  metadataEquals,
  normalizeMetadata,
  parseRagDocumentMetadata,
  stripDocIdentifierFields,
} from "../rag/metadata";
import {
  buildNotionSourceMetadata,
  extractNotionMetadata,
} from "../rag/notion-metadata";
import { buildUrlRagDocumentMetadata } from "../rag/url-metadata";
import { deriveDocIdentifiers } from "../server/doc-identifiers";
import { formatNotionPageId } from "../server/page-url";

const notion = new NotionAPI();

type ManualNotionScope = "workspace" | "selected";

const LINKED_PAGE_MAX_PAGES = 250;
const LINKED_PAGE_MAX_DEPTH = 4;

const WORKSPACE_ROOT_PAGE_ID = resolveWorkspaceRootPageId();

function resolveWorkspaceRootPageId(): string {
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
): Promise<string[]> {
  const seen = new Set<string>();
  const queue: Array<{ pageId: string; depth: number }> = [];

  for (const pageId of seedPageIds) {
    const normalized = normalizeNotionPageId(pageId);
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    queue.push({ pageId: normalized, depth: 0 });
    if (seen.size >= LINKED_PAGE_MAX_PAGES) {
      break;
    }
  }

  while (queue.length > 0 && seen.size < LINKED_PAGE_MAX_PAGES) {
    const { pageId, depth } = queue.shift()!;
    if (depth >= LINKED_PAGE_MAX_DEPTH) {
      continue;
    }

    let recordMap: ExtendedRecordMap | null = null;
    try {
      recordMap = await notion.getPage(pageId);
    } catch {
      continue;
    }

    if (!recordMap) {
      continue;
    }

    for (const block of Object.values(recordMap.block ?? {})) {
      const blockValue = block?.value ?? null;

      if (!blockValue) {
        continue;
      }

      const value = blockValue as unknown as Record<string, unknown> & {
        alive?: boolean;
      };

      if (value.alive === false) {
        continue;
      }

      const type = value.type as string | undefined;
      let candidateId: string | undefined;

      if (type === "link_to_page") {
        candidateId = (value.link_to_page as { page_id?: string } | undefined)
          ?.page_id;
      } else if (type === "alias") {
        candidateId = (
          value.format as { alias_pointer?: { id?: string } } | undefined
        )?.alias_pointer?.id;
      } else if (type === "child_page" || type === "child_database") {
        if (typeof value.id === "string") {
          candidateId = value.id;
        }
      }

      if (!candidateId) {
        continue;
      }

      const normalizedCandidate = normalizeNotionPageId(candidateId);
      if (!normalizedCandidate || seen.has(normalizedCandidate)) {
        continue;
      }

      seen.add(normalizedCandidate);
      if (seen.size >= LINKED_PAGE_MAX_PAGES) {
        break;
      }
      queue.push({ pageId: normalizedCandidate, depth: depth + 1 });
    }
  }

  return Array.from(seen);
}

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
  const rawNotionId = formatNotionPageId(pageId) ?? pageId;
  const { canonicalId, rawId } = deriveDocIdentifiers(rawNotionId);
  // NOTE: ID-sensitive ingestion path: must use deriveDocIdentifiers for doc_id/raw_doc_id.
  stats.documentsProcessed += 1;
  const title = getPageTitle(recordMap, pageId);
  await emit({
    type: "log",
    level: "info",
    message: `Fetched Notion page "${title}" (${pageId}).`,
  });
  await emit({
    type: "progress",
    step: "fetched",
    percent: 20,
  });

  const plainText = extractPlainText(recordMap, pageId);

  if (!plainText) {
    stats.documentsSkipped += 1;
    await emit({
      type: "log",
      level: "warn",
      message: `No readable content found for Notion page "${title}" (${pageId}); nothing ingested.`,
    });
    return;
  }

  await emit({
    type: "log",
    level: "info",
    message: `Preparing ${title} for ingest...`,
  });
  await emit({
    type: "progress",
    step: "processing",
    percent: 35,
  });

  const lastEditedTime = getPageLastEditedTime(recordMap, pageId);
  const contentHash = hashChunk(`${canonicalId}:${plainText}`);
  const sourceUrl = getPageUrl(pageId);

  const existingState = await getDocumentState(canonicalId);
  if (existingState?.raw_doc_id && existingState.raw_doc_id !== rawId) {
    console.warn("[doc-id] raw_doc_id drift detected", {
      canonicalId,
      previous: existingState.raw_doc_id,
      incoming: rawId,
    });
  }
  const contentUnchanged =
    !!existingState && existingState.content_hash === contentHash;
  const existingMetadata = stripDocIdentifierFields(
    existingState?.metadata ?? null,
  );
  const incomingMetadata = extractNotionMetadata(recordMap, pageId);
  const adminMetadata =
    mergeMetadata(existingMetadata, incomingMetadata) ??
    existingMetadata ??
    null;
  const sourceMetadata = buildNotionSourceMetadata(recordMap, pageId);
  const mergedMetadata = mergeRagDocumentMetadata(
    adminMetadata ?? existingMetadata ?? undefined,
    sourceMetadata,
  );
  const nextMetadata = applyDefaultDocMetadata(mergedMetadata, {
    doc_type: DEFAULT_INGEST_DOC_TYPE,
    persona_type: DEFAULT_INGEST_PERSONA_TYPE,
  });
  const metadataWithIds = normalizeMetadata({
    ...nextMetadata,
    doc_id: canonicalId,
    raw_doc_id: rawId,
  });
  debugIngestionLog("final-document-metadata", {
    docId: canonicalId,
    rawId,
    title: nextMetadata?.title,
    teaser_text: nextMetadata?.teaser_text,
    preview_image_url: nextMetadata?.preview_image_url,
  });
  const metadataUnchanged = metadataEquals(existingMetadata, nextMetadata);

  const providerHasChunks =
    contentUnchanged &&
    (await hasChunksForProvider(canonicalId, embeddingOptions));

  const decision = decideIngestAction({
    contentUnchanged,
    metadataUnchanged,
    ingestionType,
    providerHasChunks: !!providerHasChunks,
  });

  if (decision === "skip") {
    stats.documentsSkipped += 1;
    await emit({
      type: "log",
      level: "info",
      message: `No content or metadata changes detected for Notion page "${title}" (${pageId}); skipping ingest.`,
    });
    return;
  }

  if (decision === "metadata-only") {
    await upsertDocumentState({
      doc_id: canonicalId,
      raw_doc_id: rawId,
      source_url: sourceUrl,
      content_hash: contentHash,
      last_source_update: lastEditedTime ?? null,
      metadata: metadataWithIds,
      chunk_count: existingState?.chunk_count ?? undefined,
      total_characters: existingState?.total_characters ?? undefined,
    });

    stats.documentsUpdated += 1;
    await emit({
      type: "log",
      level: "info",
      message: `Metadata-only update applied for Notion page "${title}" (${pageId}); no chunking or embedding needed.`,
    });
    return;
  }

  const fullReason =
    ingestionType === "full"
      ? "Full ingestion requested"
      : contentUnchanged
        ? "Embedding refresh required for this provider"
        : "Content hash changed";
  await emit({
    type: "log",
    level: "info",
    message: `${fullReason}; performing full content ingest for Notion page "${title}" (${pageId}).`,
  });

  const chunks = chunkByTokens(plainText, 450, 75);
  if (chunks.length === 0) {
    stats.documentsSkipped += 1;
    await emit({
      type: "log",
      level: "warn",
      message: `Chunking produced no content for Notion page ${title}; nothing stored.`,
    });
    return;
  }

  await emit({
    type: "progress",
    step: "embedding",
    percent: 60,
  });
  await emit({
    type: "log",
    level: "info",
    message: `Embedding ${chunks.length} chunk(s)...`,
  });
  const embeddings = await embedBatch(chunks, embeddingOptions);
  const ingestedAt = new Date().toISOString();

  const rows: ChunkInsert[] = chunks.map((chunk, index) => ({
    doc_id: canonicalId,
    source_url: sourceUrl,
    title,
    chunk,
    chunk_hash: hashChunk(`${canonicalId}:${chunk}`),
    embedding: embeddings[index]!,
    ingested_at: ingestedAt,
  }));

  const chunkCount = rows.length;
  const totalCharacters = rows.reduce((sum, row) => sum + row.chunk.length, 0);

  await emit({
    type: "progress",
    step: "saving",
    percent: 85,
  });
  await replaceChunks(canonicalId, rows, embeddingOptions);
  await upsertDocumentState({
    doc_id: canonicalId,
    raw_doc_id: rawId,
    source_url: sourceUrl,
    content_hash: contentHash,
    last_source_update: lastEditedTime ?? null,
    chunk_count: chunkCount,
    total_characters: totalCharacters,
    metadata: metadataWithIds,
  });

  if (existingState) {
    stats.documentsUpdated += 1;
    stats.chunksUpdated += chunkCount;
    stats.charactersUpdated += totalCharacters;
  } else {
    stats.documentsAdded += 1;
    stats.chunksAdded += chunkCount;
    stats.charactersAdded += totalCharacters;
  }

  await emit({
    type: "log",
    level: "info",
    message: `Stored ${chunkCount} chunk(s) for ${title}.`,
  });

  return;
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
    rootPageId = WORKSPACE_ROOT_PAGE_ID;
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

    const pageMap = await getAllPagesInSpace(
      rootPageId,
      undefined,
      async (candidateId) => notion.getPage(candidateId),
    );

    for (const rawId of Object.keys(pageMap)) {
      pushCandidate(rawId);
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

      try {
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
            : `Processed ${processedPages.length} Notion page(s) workspace-wide; updated ${updatedPages}, skipped ${skippedPages}.`;
      } else if (includeLinkedPages) {
        finalMessage =
          processedPages.length === 0
            ? "No Notion pages were available to ingest."
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
    stats.documentsProcessed += 1;
    await emit({
      type: "log",
      level: "info",
      message: `Fetching ${url}...`,
    });
    const { title, text, lastModified } = await extractMainContent(url);
    await emit({
      type: "progress",
      step: "fetched",
      percent: 25,
    });

    if (!text) {
      stats.documentsSkipped += 1;
      finalMessage = `No readable text extracted from ${url}; nothing ingested.`;
      await emit({
        type: "log",
        level: "warn",
        message: finalMessage,
      });
      return;
    }

    const contentHash = hashChunk(`${url}:${text}`);
    const existingState = await getDocumentState(url);
    const unchanged = isUnchanged(existingState, {
      contentHash,
      lastSourceUpdate: lastModified ?? null,
    });

    const providerHasChunks =
      unchanged && (await hasChunksForProvider(url, embeddingOptions));
    const skip = shouldSkipIngest({
      unchanged,
      ingestionType,
      providerHasChunks: !!providerHasChunks,
    });

    if (skip) {
      stats.documentsSkipped += 1;
      finalMessage = `No changes detected for ${title} (${url}); skipping ingest.`;
      await emit({
        type: "log",
        level: "info",
        message: finalMessage,
      });
      return;
    }

    await emit({
      type: "progress",
      step: "processing",
      percent: 45,
    });
    const chunks = chunkByTokens(text, 450, 75);

    if (chunks.length === 0) {
      stats.documentsSkipped += 1;
      finalMessage = `Extracted content produced no chunks for ${url}; nothing stored.`;
      await emit({
        type: "log",
        level: "warn",
        message: finalMessage,
      });
      return;
    }

    await emit({
      type: "log",
      level: "info",
      message: `Embedding ${chunks.length} chunk(s)...`,
    });
    await emit({
      type: "progress",
      step: "embedding",
      percent: 65,
    });
    const embeddings = await embedBatch(chunks, embeddingOptions);
    const ingestedAt = new Date().toISOString();

    const rows: ChunkInsert[] = chunks.map((chunk, index) => ({
      doc_id: url,
      source_url: url,
      title,
      chunk,
      chunk_hash: hashChunk(`${url}:${chunk}`),
      embedding: embeddings[index]!,
      ingested_at: ingestedAt,
    }));

    const chunkCount = rows.length;
    const totalCharacters = rows.reduce(
      (sum, row) => sum + row.chunk.length,
      0,
    );

    await emit({
      type: "progress",
      step: "saving",
      percent: 85,
    });
    await replaceChunks(url, rows, {
      provider: embeddingOptions.provider ?? null,
      embeddingModelId: embeddingOptions.embeddingModelId,
      embeddingSpaceId: embeddingOptions.embeddingSpaceId,
    });
    const existingMetadata = parseRagDocumentMetadata(existingState?.metadata);
    const sourceMetadata = buildUrlRagDocumentMetadata({
      sourceUrl: url,
      htmlTitle: title,
    });
    const nextMetadata = mergeRagDocumentMetadata(
      existingMetadata,
      sourceMetadata,
    );

    await upsertDocumentState({
      doc_id: url,
      source_url: url,
      content_hash: contentHash,
      last_source_update: lastModified ?? null,
      chunk_count: chunkCount,
      total_characters: totalCharacters,
      metadata: nextMetadata,
    });

    if (existingState) {
      stats.documentsUpdated += 1;
      stats.chunksUpdated += chunkCount;
      stats.charactersUpdated += totalCharacters;
    } else {
      stats.documentsAdded += 1;
      stats.chunksAdded += chunkCount;
      stats.charactersAdded += totalCharacters;
    }

    await emit({
      type: "log",
      level: "info",
      message: `Stored ${chunkCount} chunk(s) for ${title}.`,
    });
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
