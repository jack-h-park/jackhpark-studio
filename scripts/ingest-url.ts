// scripts/ingest-url.ts
import pMap from "p-map";

import { resolveEmbeddingSpace } from "../lib/core/embedding-spaces";
import { ingestionLogger } from "../lib/logging/logger";
import {
  chunkByTokens,
  type ChunkInsert,
  createEmptyRunStats,
  embedBatch,
  type ExtractedArticle,
  extractMainContent,
  finishIngestRun,
  getDocumentState,
  hasChunksForProvider,
  hashChunk,
  type IngestRunErrorLog,
  type IngestRunHandle,
  type IngestRunStats,
  replaceChunks,
  startIngestRun,
  upsertDocumentState,
} from "../lib/rag";
import { isUnchanged, shouldSkipIngest } from "../lib/rag/ingest-helpers";
import {
  applyDefaultDocMetadata,
  DEFAULT_INGEST_DOC_TYPE,
  DEFAULT_INGEST_PERSONA_TYPE,
  mergeRagDocumentMetadata,
  normalizeMetadata,
  stripDocIdentifierFields,
} from "../lib/rag/metadata";
import { buildUrlRagDocumentMetadata } from "../lib/rag/url-metadata";
import { deriveDocIdentifiers } from "../lib/server/doc-identifiers";

const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? "4", 10),
);

const DEFAULT_EMBEDDING_SELECTION = resolveEmbeddingSpace({
  embeddingSpaceId: process.env.EMBEDDING_SPACE_ID ?? null,
  embeddingModelId: process.env.EMBEDDING_MODEL ?? null,
  provider: process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER ?? null,
  version: process.env.EMBEDDING_VERSION ?? null,
});

type RunMode = {
  type: "full" | "partial";
};

type ParsedArgs = {
  mode: RunMode;
  urls: string[];
};

function parseArgs(defaultType: "full" | "partial"): ParsedArgs {
  const raw = process.argv.slice(2);
  const urls: string[] = [];
  let mode: RunMode = { type: defaultType };

  for (const element of raw) {
    const arg = element!;

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

    urls.push(arg);
  }

  return { mode, urls };
}

async function ingestUrl(
  url: string,
  stats: IngestRunStats,
  ingestionType: RunMode["type"],
): Promise<void> {
  stats.documentsProcessed += 1;
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    ingestionLogger.error(
      "[ingest-url] Empty URL provided; skipping ingestion.",
    );
    stats.documentsSkipped += 1;
    return;
  }
  const { canonicalId, rawId } = deriveDocIdentifiers(normalizedUrl);
  // NOTE: ID-sensitive ingestion path: must use deriveDocIdentifiers for doc_id/raw_doc_id.

  const { title, text, lastModified }: ExtractedArticle =
    await extractMainContent(normalizedUrl);

  if (!text) {
    ingestionLogger.error(
      `[ingest-url] No text content extracted for ${normalizedUrl}; skipping`,
    );
    stats.documentsSkipped += 1;
    return;
  }

  const contentHash = hashChunk(`${canonicalId}:${text}`);
  const existingState = await getDocumentState(canonicalId);
  if (existingState?.raw_doc_id && existingState.raw_doc_id !== rawId) {
    ingestionLogger.error("[doc-id] raw_doc_id drift detected", {
      canonicalId,
      previous: existingState.raw_doc_id,
      incoming: rawId,
    });
  }
  const embeddingSpace = DEFAULT_EMBEDDING_SELECTION;
  const unchanged = isUnchanged(existingState, {
    contentHash,
    lastSourceUpdate: lastModified ?? null,
  });

  const existingMetadata = stripDocIdentifierFields(
    existingState?.metadata ?? null,
  );
  const sourceMetadata = buildUrlRagDocumentMetadata({
    sourceUrl: normalizedUrl,
    htmlTitle: title,
  });
  const mergedMetadata = mergeRagDocumentMetadata(
    existingMetadata,
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

  const providerHasChunks =
    unchanged && (await hasChunksForProvider(canonicalId, embeddingSpace));
  const shouldSkip = shouldSkipIngest({
    unchanged,
    ingestionType,
    providerHasChunks: !!providerHasChunks,
  });

  if (shouldSkip) {
    ingestionLogger.info(`[ingest-url] Skipping unchanged URL: ${title}`);
    stats.documentsSkipped += 1;
    return;
  }

  const chunks = chunkByTokens(text, 450, 75);

  if (chunks.length === 0) {
    ingestionLogger.error(
      `[ingest-url] Extracted content for ${normalizedUrl} produced no chunks; skipping`,
    );
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
    source_url: normalizedUrl,
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
    source_url: normalizedUrl,
    content_hash: contentHash,
    last_source_update: lastModified ?? null,
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
    `Ingested URL: ${title} (${chunkCount} chunks) [${
      existingState ? "updated" : "new"
    }]`,
  );
}

async function main(): Promise<void> {
  console.log("Starting external URL ingestion...");

  const { mode, urls } = parseArgs("partial");
  const targets = urls.filter(Boolean);

  if (targets.length === 0) {
    console.error(
      "Usage: pnpm tsx scripts/ingest-url.ts [--full|--partial] <url> [url...]",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Ingesting ${targets.length} URL(s)...`);

  const embeddingSpace = DEFAULT_EMBEDDING_SELECTION;

  const runHandle: IngestRunHandle = await startIngestRun({
    source: "web",
    ingestion_type: mode.type,
    metadata: {
      urlCount: targets.length,
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
    await pMap(
      targets,
      async (url) => {
        try {
          await ingestUrl(url, stats, mode.type);
        } catch (err) {
          stats.errorCount += 1;
          const message =
            err instanceof Error ? err.message : JSON.stringify(err);
          errorLogs.push({ context: url, message });
          ingestionLogger.error(
            `[ingest-url] Failed to ingest ${url}: ${message}`,
          );
        }
      },
      { concurrency: INGEST_CONCURRENCY },
    );

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
