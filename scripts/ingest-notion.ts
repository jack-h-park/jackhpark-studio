// scripts/ingest-notion.ts
import { NotionAPI } from "notion-client";
import { type ExtendedRecordMap } from "notion-types";
import { getAllPagesInSpace } from "notion-utils";
import pMap from "p-map";

import { rootNotionPageId as configRootNotionPageId } from "../lib/config";
import { resolveEmbeddingSpace } from "../lib/core/embedding-spaces";
import {
  chunkByTokens,
  type ChunkInsert,
  createEmptyRunStats,
  embedBatch,
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
} from "../lib/rag";
import { debugIngestionLog } from "../lib/rag/debug";
import { decideIngestAction } from "../lib/rag/ingest-helpers";
import {
  applyDefaultDocMetadata,
  DEFAULT_INGEST_DOC_TYPE,
  DEFAULT_INGEST_PERSONA_TYPE,
  mergeMetadata,
  mergeRagDocumentMetadata,
  metadataEquals,
  normalizeMetadata,
  stripDocIdentifierFields,
} from "../lib/rag/metadata";
import {
  buildNotionSourceMetadata,
  extractNotionMetadata,
} from "../lib/rag/notion-metadata";
import { deriveDocIdentifiers } from "../lib/server/doc-identifiers";
import { formatNotionPageId } from "../lib/server/page-url";

const notion = new NotionAPI();
const DEFAULT_EMBEDDING_SELECTION = resolveEmbeddingSpace({
  embeddingSpaceId: process.env.EMBEDDING_SPACE_ID ?? null,
  embeddingModelId: process.env.EMBEDDING_MODEL ?? null,
  provider: process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER ?? null,
  version: process.env.EMBEDDING_VERSION ?? null,
});
const DEFAULT_ROOT_PAGE_ID = configRootNotionPageId;

type RunMode = {
  type: "full" | "partial";
};

function parseRunMode(defaultType: "full" | "partial"): RunMode {
  const args = process.argv.slice(2);
  let mode: RunMode = { type: defaultType };

  for (const arg_ of args) {
    const arg = arg_!;

    if (arg === "--full" || arg === "--mode=full") {
      mode = { type: "full" };
      continue;
    }

    if (arg === "--partial" || arg === "--mode=partial") {
      mode = { type: "partial" };
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.split("=")[1];
      if (value === "full" || value === "partial") {
        mode = { type: value };
      }
      continue;
    }
  }

  return mode;
}
const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? "2", 10),
);

async function ingestPage(
  pageId: string,
  recordMap: ExtendedRecordMap,
  stats: IngestRunStats,
  ingestionType: RunMode["type"],
): Promise<void> {
  stats.documentsProcessed += 1;
  const rawNotionId = formatNotionPageId(pageId) ?? pageId;
  const { canonicalId, rawId } = deriveDocIdentifiers(rawNotionId);
  // NOTE: ID-sensitive ingestion path: must use deriveDocIdentifiers for doc_id/raw_doc_id.

  const title = getPageTitle(recordMap, pageId);
  const plainText = extractPlainText(recordMap, pageId);

  if (!plainText) {
    console.warn(`No readable content for Notion page ${pageId}; skipping`);
    stats.documentsSkipped += 1;
    return;
  }

  const lastEditedTime = getPageLastEditedTime(recordMap, pageId);
  const pageHash = hashChunk(`${canonicalId}:${plainText}`);
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
    !!existingState && existingState.content_hash === pageHash;
  const existingMetadata = stripDocIdentifierFields(
    existingState?.metadata ?? null,
  );
  const incomingMetadata = extractNotionMetadata(recordMap, pageId);
  const sourceMetadata = buildNotionSourceMetadata(recordMap, pageId);
  const adminMetadata =
    mergeMetadata(existingMetadata, incomingMetadata) ??
    existingMetadata ??
    null;
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

  const embeddingSpace = DEFAULT_EMBEDDING_SELECTION;
  const providerHasChunks =
    contentUnchanged && (await hasChunksForProvider(canonicalId, embeddingSpace));
  const decision = decideIngestAction({
    contentUnchanged,
    metadataUnchanged,
    ingestionType,
    providerHasChunks: !!providerHasChunks,
  });

  if (decision === "skip") {
    console.log(
      `Skipping unchanged Notion page: ${title} (content and metadata unchanged)`,
    );
    stats.documentsSkipped += 1;
    return;
  }

  if (decision === "metadata-only") {
    await upsertDocumentState({
      doc_id: canonicalId,
      raw_doc_id: rawId,
      source_url: sourceUrl,
      content_hash: pageHash,
      last_source_update: lastEditedTime ?? null,
      metadata: metadataWithIds,
      chunk_count: existingState?.chunk_count ?? undefined,
      total_characters: existingState?.total_characters ?? undefined,
    });

    stats.documentsUpdated += 1;
    console.log(
      `Metadata-only update applied for Notion page: ${title}; skipped chunking and embeddings.`,
    );
    return;
  }

  const fullReason =
    ingestionType === "full"
      ? "Full ingestion requested"
      : contentUnchanged
        ? "Embedding refresh required for this provider"
        : "Content hash changed";
  console.log(
    `${fullReason}; performing full content ingest for Notion page: ${title}.`,
  );

  const chunks = chunkByTokens(plainText, 450, 75);
  if (chunks.length === 0) {
    console.warn(`Chunking produced no content for ${pageId}; skipping`);
    stats.documentsSkipped += 1;
    return;
  }

  const embeddings = await embedBatch(chunks, {
    provider: embeddingSpace.provider,
    embeddingModelId: embeddingSpace.embeddingModelId,
    embeddingSpaceId: embeddingSpace.embeddingSpaceId,
    version: embeddingSpace.version,
  });
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

  await replaceChunks(canonicalId, rows, {
    provider: embeddingSpace.provider,
    embeddingModelId: embeddingSpace.embeddingModelId,
    embeddingSpaceId: embeddingSpace.embeddingSpaceId,
    version: embeddingSpace.version,
  });
  await upsertDocumentState({
    doc_id: canonicalId,
    raw_doc_id: rawId,
    source_url: sourceUrl,
    content_hash: pageHash,
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

  console.log(
    `Ingested Notion page: ${title} (${chunkCount} chunks) [${
      existingState ? "updated" : "new"
    }]`,
  );
}

async function ingestWorkspace(
  rootPageId: string,
  stats: IngestRunStats,
  errorLogs: IngestRunErrorLog[],
  ingestionType: RunMode["type"],
) {
  console.log(`\nFetching all pages in Notion space (root: ${rootPageId})...`);
  const pageMap = await getAllPagesInSpace(
    rootPageId,
    undefined,
    async (pageId) => notion.getPage(pageId),
  );

  console.log(`Found ${Object.keys(pageMap).length} total pages.`);

  const entries = Object.entries(pageMap).filter(
    (entry): entry is [string, ExtendedRecordMap] => Boolean(entry[1]),
  );

  if (entries.length === 0) {
    console.log("No pages to ingest.");
    return;
  }

  await pMap(
    entries,
    async ([pageId, recordMap]) => {
      try {
        await ingestPage(pageId, recordMap, stats, ingestionType);
      } catch (err) {
        stats.errorCount += 1;
        const message =
          err instanceof Error ? err.message : JSON.stringify(err);
        errorLogs.push({
          doc_id: pageId,
          message,
        });
        console.error(`Failed to ingest Notion page ${pageId}: ${message}`);
      }
    },
    { concurrency: INGEST_CONCURRENCY },
  );
}

async function ingestSinglePage(
  pageId: string,
  stats: IngestRunStats,
  errorLogs: IngestRunErrorLog[],
  ingestionType: RunMode["type"],
) {
  debugIngestionLog("single-page-mode", { pageId });
  try {
    const recordMap = await notion.getPage(pageId);
    await ingestPage(pageId, recordMap, stats, ingestionType);
  } catch (err) {
    stats.errorCount += 1;
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    errorLogs.push({
      doc_id: pageId,
      message,
    });
    console.error(`Failed to ingest Notion page ${pageId}: ${message}`);
  }
}

async function main() {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID ?? DEFAULT_ROOT_PAGE_ID;
  if (!rootPageId) {
    throw new Error(
      "Missing Notion root page ID. Set NOTION_ROOT_PAGE_ID or configure it in site.config.ts.",
    );
  }

  console.log("Starting Notion ingestion...");

  const mode = parseRunMode("full");

  const embeddingSpace = DEFAULT_EMBEDDING_SELECTION;

  const runHandle: IngestRunHandle = await startIngestRun({
    source: "notion",
    ingestion_type: mode.type,
    metadata: {
      rootPageId,
      embeddingProvider: embeddingSpace.provider,
      embeddingSpaceId: embeddingSpace.embeddingSpaceId,
      embeddingModelId: embeddingSpace.embeddingModelId,
      embeddingVersion: embeddingSpace.version,
    },
  });

  const stats = createEmptyRunStats();
  const errorLogs: IngestRunErrorLog[] = [];
  const started = Date.now();

  try {
    if (process.env.DEBUG_NOTION_PAGE_ID) {
      await ingestSinglePage(
        process.env.DEBUG_NOTION_PAGE_ID,
        stats,
        errorLogs,
        mode.type,
      );
    } else {
      await ingestWorkspace(rootPageId, stats, errorLogs, mode.type);
    }
    const durationMs = Date.now() - started;
    const status = stats.errorCount > 0 ? "completed_with_errors" : "success";

    await finishIngestRun(runHandle, {
      status,
      durationMs,
      totals: stats,
      errorLogs,
    });

    console.log("\n--- Ingestion Complete ---");
    console.log(`Duration: ${(durationMs / 1000).toFixed(2)}s`);
    console.log(`Status: ${status}`);
    console.log("Documents:");
    console.log(`  - Processed: ${stats.documentsProcessed}`);
    console.log(`  - Added:     ${stats.documentsAdded}`);
    console.log(`  - Updated:   ${stats.documentsUpdated}`);
    console.log(`  - Skipped:   ${stats.documentsSkipped}`);
    console.log("Chunks:");
    console.log(`  - Added:     ${stats.chunksAdded}`);
    console.log(`  - Updated:   ${stats.chunksUpdated}`);
    console.log("Characters:");
    console.log(`  - Added:     ${stats.charactersAdded}`);
    console.log(`  - Updated:   ${stats.charactersUpdated}`);
    console.log(`Errors: ${stats.errorCount}`);

    if (stats.errorCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    errorLogs.push({ context: "fatal", message });
    stats.errorCount += 1;

    await finishIngestRun(runHandle, {
      status: "failed",
      durationMs,
      totals: stats,
      errorLogs,
    });

    console.error("\n--- Ingestion Failed ---");
    console.error(err);
    throw err;
  }
}

await main();
