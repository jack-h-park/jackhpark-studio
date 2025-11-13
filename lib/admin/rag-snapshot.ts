import {
  type ModelProvider,
  normalizeModelProvider,
} from "@/lib/shared/model-provider";

import type { RunStatus } from "./ingestion-runs";

export type RawSnapshotRecord = {
  id?: string;
  captured_at?: string;
  schema_version?: number;
  run_id?: string | null;
  run_status?: RunStatus | null;
  run_started_at?: string | null;
  run_ended_at?: string | null;
  run_duration_ms?: number | null;
  run_error_count?: number | null;
  run_documents_skipped?: number | null;
  embedding_provider?: string | null;
  ingestion_mode?: string | null;
  total_documents?: number | null;
  total_chunks?: number | null;
  total_characters?: number | null;
  delta_documents?: number | null;
  delta_chunks?: number | null;
  delta_characters?: number | null;
  error_count?: number | null;
  skipped_documents?: number | null;
  queue_depth?: number | null;
  retry_count?: number | null;
  pending_runs?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type SnapshotRecord = {
  id: string;
  capturedAt: string | null;
  schemaVersion: number | null;
  runId: string | null;
  runStatus: RunStatus | null;
  runStartedAt: string | null;
  runEndedAt: string | null;
  runDurationMs: number | null;
  runErrorCount: number | null;
  runDocumentsSkipped: number | null;
  embeddingProvider: ModelProvider;
  ingestionMode: string | null;
  totalDocuments: number;
  totalChunks: number;
  totalCharacters: number;
  deltaDocuments: number | null;
  deltaChunks: number | null;
  deltaCharacters: number | null;
  errorCount: number | null;
  skippedDocuments: number | null;
  queueDepth: number | null;
  retryCount: number | null;
  pendingRuns: number | null;
  metadata: Record<string, unknown> | null;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNumberOrZero(value: unknown): number {
  return toNullableNumber(value) ?? 0;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function toRunStatus(value: unknown): RunStatus | null {
  if (
    value === "in_progress" ||
    value === "success" ||
    value === "completed_with_errors" ||
    value === "failed"
  ) {
    return value;
  }
  return null;
}

export function normalizeSnapshotRecord(
  raw: unknown,
): SnapshotRecord | null {
  if (!isPlainRecord(raw)) {
    return null;
  }

  const embeddingProvider = normalizeModelProvider(
    toStringOrNull(raw.embedding_provider),
    "openai",
  );

  return {
    id: toStringOrNull(raw.id) ?? "",
    capturedAt: toStringOrNull(raw.captured_at),
    schemaVersion: toNullableNumber(raw.schema_version),
    runId: toStringOrNull(raw.run_id),
    runStatus: toRunStatus(raw.run_status),
    runStartedAt: toStringOrNull(raw.run_started_at),
    runEndedAt: toStringOrNull(raw.run_ended_at),
    runDurationMs: toNullableNumber(raw.run_duration_ms),
    runErrorCount: toNullableNumber(raw.run_error_count),
    runDocumentsSkipped: toNullableNumber(raw.run_documents_skipped),
    embeddingProvider,
    ingestionMode: toStringOrNull(raw.ingestion_mode),
    totalDocuments: toNumberOrZero(raw.total_documents),
    totalChunks: toNumberOrZero(raw.total_chunks),
    totalCharacters: toNumberOrZero(raw.total_characters),
    deltaDocuments: toNullableNumber(raw.delta_documents),
    deltaChunks: toNullableNumber(raw.delta_chunks),
    deltaCharacters: toNullableNumber(raw.delta_characters),
    errorCount: toNullableNumber(raw.error_count),
    skippedDocuments: toNullableNumber(raw.skipped_documents),
    queueDepth: toNullableNumber(raw.queue_depth),
    retryCount: toNullableNumber(raw.retry_count),
    pendingRuns: toNullableNumber(raw.pending_runs),
    metadata: isPlainRecord(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : null,
  };
}
