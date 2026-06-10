import { supabaseClient } from "../core/supabase";
import { debugIngestionLog } from "./debug";
import {
  chunkByTokens,
  type ChunkInsert,
  createEmptyRunStats,
  embedBatch,
  type EmbedBatchOptions,
  finishIngestRun,
  getDocumentState,
  hasChunksForProvider,
  hashChunk,
  type IngestRunErrorLog,
  type IngestRunStartInput,
  type IngestRunStats,
  replaceChunks,
  startIngestRun,
  upsertDocumentState,
} from "./index";
import { decideIngestAction, isUnchanged } from "./ingest-helpers";
import {
  metadataEquals,
  normalizeMetadata,
  type RagDocumentMetadata,
  stripDocIdentifierFields,
} from "./metadata";
import { markSuccess } from "./ragDocumentLifecycle";

const CHUNK_MAX_TOKENS = 450;
const CHUNK_OVERLAP_TOKENS = 75;

export type IngestLogLevel = "info" | "warn" | "error";

export type IngestProgressStep = "processing" | "embedding" | "saving";

/**
 * Optional sink for human-facing progress. CLI scripts back this with the
 * console; the admin manual ingestor forwards to its SSE event stream.
 */
export type IngestReporter = {
  log?: (level: IngestLogLevel, message: string) => Promise<void> | void;
  progress?: (step: IngestProgressStep) => Promise<void> | void;
};

/**
 * A source-agnostic document ready for the shared ingest pipeline.
 * Source adapters (Notion, URL, ...) are responsible for fetching/parsing
 * and for source-specific metadata; everything downstream is shared.
 */
export type PreparedDocument = {
  canonicalId: string;
  rawId: string;
  /** Human-readable label used in log messages. */
  label: string;
  sourceUrl: string;
  title: string;
  text: string;
  lastSourceUpdate: string | null;
  /** Status recorded on lifecycle markSuccess (HTTP status for URLs). */
  statusCode: number | null;
  /**
   * "hash": content hash comparison only (Notion — last_edited_time moves on
   * any page touch). "hash-and-timestamp": also require last_source_update to
   * match (URLs, via Last-Modified).
   */
  changeDetection: "hash" | "hash-and-timestamp";
  buildMetadata: (
    existingMetadata: RagDocumentMetadata | null,
  ) =>
    | Promise<RagDocumentMetadata | null>
    | RagDocumentMetadata
    | null;
};

export type IngestDocumentOutcome =
  | { action: "skipped"; reason: "empty-content" | "unchanged" | "empty-chunks" }
  | { action: "metadata-only" }
  | {
      action: "ingested";
      result: "added" | "updated";
      chunkCount: number;
      totalCharacters: number;
    };

/**
 * Shared per-document ingest sequence: change detection → skip/metadata-only
 * decision → chunk → embed → store → lifecycle marking. Mutates `stats` so
 * callers can aggregate across documents within a run.
 */
export async function ingestPreparedDocument({
  doc,
  ingestionType,
  embedding,
  stats,
  reporter = {},
}: {
  doc: PreparedDocument;
  ingestionType: "full" | "partial";
  embedding: EmbedBatchOptions;
  stats: IngestRunStats;
  reporter?: IngestReporter;
}): Promise<IngestDocumentOutcome> {
  const { log, progress } = reporter;
  const { canonicalId, rawId } = doc;
  stats.documentsProcessed += 1;

  if (!doc.text) {
    await markSuccess(supabaseClient, canonicalId, doc.statusCode);
    stats.documentsSkipped += 1;
    await log?.(
      "warn",
      `No readable content for ${doc.label}; nothing ingested.`,
    );
    return { action: "skipped", reason: "empty-content" };
  }

  await progress?.("processing");

  const contentHash = hashChunk(`${canonicalId}:${doc.text}`);
  const existingState = await getDocumentState(canonicalId);
  if (existingState?.raw_doc_id && existingState.raw_doc_id !== rawId) {
    console.warn("[doc-id] raw_doc_id drift detected", {
      canonicalId,
      previous: existingState.raw_doc_id,
      incoming: rawId,
    });
  }

  const contentUnchanged =
    doc.changeDetection === "hash"
      ? !!existingState && existingState.content_hash === contentHash
      : isUnchanged(existingState, {
          contentHash,
          lastSourceUpdate: doc.lastSourceUpdate,
        });

  const existingMetadata = stripDocIdentifierFields(
    existingState?.metadata ?? null,
  );
  const nextMetadata = await doc.buildMetadata(existingMetadata);
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
    contentUnchanged && (await hasChunksForProvider(canonicalId, embedding));
  const decision = decideIngestAction({
    contentUnchanged,
    metadataUnchanged,
    ingestionType,
    providerHasChunks: !!providerHasChunks,
  });

  if (decision === "skip") {
    await markSuccess(supabaseClient, canonicalId, doc.statusCode);
    stats.documentsSkipped += 1;
    await log?.(
      "info",
      `No content or metadata changes detected for ${doc.label}; skipping ingest.`,
    );
    return { action: "skipped", reason: "unchanged" };
  }

  if (decision === "metadata-only") {
    await upsertDocumentState({
      doc_id: canonicalId,
      raw_doc_id: rawId,
      source_url: doc.sourceUrl,
      content_hash: contentHash,
      last_source_update: doc.lastSourceUpdate,
      metadata: metadataWithIds,
      chunk_count: existingState?.chunk_count ?? undefined,
      total_characters: existingState?.total_characters ?? undefined,
    });
    await markSuccess(supabaseClient, canonicalId, doc.statusCode);

    stats.documentsUpdated += 1;
    await log?.(
      "info",
      `Metadata-only update applied for ${doc.label}; skipped chunking and embeddings.`,
    );
    return { action: "metadata-only" };
  }

  const fullReason =
    ingestionType === "full"
      ? "Full ingestion requested"
      : contentUnchanged
        ? "Embedding refresh required for this provider"
        : "Content hash changed";
  await log?.(
    "info",
    `${fullReason}; performing full content ingest for ${doc.label}.`,
  );

  const chunks = chunkByTokens(doc.text, CHUNK_MAX_TOKENS, CHUNK_OVERLAP_TOKENS);
  if (chunks.length === 0) {
    await markSuccess(supabaseClient, canonicalId, doc.statusCode);
    stats.documentsSkipped += 1;
    await log?.(
      "warn",
      `Chunking produced no content for ${doc.label}; nothing stored.`,
    );
    return { action: "skipped", reason: "empty-chunks" };
  }

  await progress?.("embedding");
  await log?.("info", `Embedding ${chunks.length} chunk(s)...`);
  const embeddings = await embedBatch(chunks, embedding);
  const ingestedAt = new Date().toISOString();

  const rows: ChunkInsert[] = chunks.map((chunk, index) => ({
    doc_id: canonicalId,
    source_url: doc.sourceUrl,
    title: doc.title,
    chunk,
    chunk_hash: hashChunk(`${canonicalId}:${chunk}`),
    embedding: embeddings[index]!,
    ingested_at: ingestedAt,
  }));

  const chunkCount = rows.length;
  const totalCharacters = rows.reduce((sum, row) => sum + row.chunk.length, 0);

  await progress?.("saving");
  await replaceChunks(canonicalId, rows, embedding);
  await upsertDocumentState({
    doc_id: canonicalId,
    raw_doc_id: rawId,
    source_url: doc.sourceUrl,
    content_hash: contentHash,
    last_source_update: doc.lastSourceUpdate,
    chunk_count: chunkCount,
    total_characters: totalCharacters,
    metadata: metadataWithIds,
  });
  await markSuccess(supabaseClient, canonicalId, doc.statusCode);

  const result = existingState ? "updated" : "added";
  if (existingState) {
    stats.documentsUpdated += 1;
    stats.chunksUpdated += chunkCount;
    stats.charactersUpdated += totalCharacters;
  } else {
    stats.documentsAdded += 1;
    stats.chunksAdded += chunkCount;
    stats.charactersAdded += totalCharacters;
  }

  await log?.("info", `Stored ${chunkCount} chunk(s) for ${doc.label}.`);
  return { action: "ingested", result, chunkCount, totalCharacters };
}

export type IngestRunResult = {
  stats: IngestRunStats;
  errorLogs: IngestRunErrorLog[];
  status: "success" | "completed_with_errors" | "failed";
  durationMs: number;
};

/**
 * Run-level bookkeeping shared by the CLI ingestion scripts: opens a
 * rag_ingest_runs row, executes the job, and records totals/status.
 * A thrown error finishes the run as "failed" and rethrows.
 */
export async function withIngestRun(
  start: IngestRunStartInput,
  execute: (ctx: {
    stats: IngestRunStats;
    errorLogs: IngestRunErrorLog[];
  }) => Promise<void>,
): Promise<IngestRunResult> {
  const runHandle = await startIngestRun(start);
  const stats = createEmptyRunStats();
  const errorLogs: IngestRunErrorLog[] = [];
  const started = Date.now();

  try {
    await execute({ stats, errorLogs });
  } catch (err) {
    const durationMs = Date.now() - started;
    errorLogs.push({
      context: "fatal",
      message: err instanceof Error ? err.message : String(err),
    });
    stats.errorCount += 1;
    await finishIngestRun(runHandle, {
      status: "failed",
      durationMs,
      totals: stats,
      errorLogs,
    });
    throw err;
  }

  const durationMs = Date.now() - started;
  const status = stats.errorCount > 0 ? "completed_with_errors" : "success";
  await finishIngestRun(runHandle, {
    status,
    durationMs,
    totals: stats,
    errorLogs,
  });

  return { stats, errorLogs, status, durationMs };
}

export function formatRunSummary({
  stats,
  status,
  durationMs,
}: IngestRunResult): string {
  return [
    "\n--- Ingestion Complete ---",
    `Duration: ${(durationMs / 1000).toFixed(2)}s`,
    `Status: ${status}`,
    "Documents:",
    `  - Processed: ${stats.documentsProcessed}`,
    `  - Added:     ${stats.documentsAdded}`,
    `  - Updated:   ${stats.documentsUpdated}`,
    `  - Skipped:   ${stats.documentsSkipped}`,
    "Chunks:",
    `  - Added:     ${stats.chunksAdded}`,
    `  - Updated:   ${stats.chunksUpdated}`,
    "Characters:",
    `  - Added:     ${stats.charactersAdded}`,
    `  - Updated:   ${stats.charactersUpdated}`,
    `Errors: ${stats.errorCount}`,
  ].join("\n");
}
