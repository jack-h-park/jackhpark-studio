export type RunStatus =
  | "in_progress"
  | "success"
  | "completed_with_errors"
  | "failed";

export type IngestionType = "full" | "partial";

export type RunRecord = {
  id: string;
  source: string;
  ingestion_type: IngestionType;
  partial_reason: string | null;
  status: RunStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  documents_processed: number | null;
  documents_added: number | null;
  documents_updated: number | null;
  documents_skipped: number | null;
  chunks_added: number | null;
  chunks_updated: number | null;
  characters_added: number | null;
  characters_updated: number | null;
  error_count: number | null;
  error_logs: Array<{
    context?: string | null;
    doc_id?: string | null;
    message: string;
  }> | null;
  metadata: Record<string, unknown> | null;
};

export const RUN_STATUS_VALUES: readonly RunStatus[] = [
  "in_progress",
  "success",
  "completed_with_errors",
  "failed",
] as const;

export const INGESTION_TYPE_VALUES: readonly IngestionType[] = [
  "full",
  "partial",
] as const;

export const DEFAULT_RUNS_PAGE_SIZE = 25;
export const MAX_RUNS_PAGE_SIZE = 100;

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

function toStatus(value: unknown): RunStatus {
  if (RUN_STATUS_VALUES.includes(value as RunStatus)) {
    return value as RunStatus;
  }

  return "success";
}

function toIngestionType(value: unknown): IngestionType {
  return value === "partial" ? "partial" : "full";
}

function toIsoStringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function normalizeErrorLogs(value: unknown): RunRecord["error_logs"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isPlainRecord(entry)) {
        return null;
      }

      const message = entry.message;
      if (typeof message !== "string" || message.length === 0) {
        return null;
      }

      const context = entry.context;
      const docId = entry.doc_id;

      return {
        message,
        context: typeof context === "string" ? context : null,
        doc_id: typeof docId === "string" ? docId : null,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        message: string;
        context: string | null;
        doc_id: string | null;
      } => entry !== null,
    );
}

export function normalizeRunRecord(raw: unknown): RunRecord {
  const record: Record<string, unknown> = isPlainRecord(raw) ? raw : {};

  const metadata = isPlainRecord(record.metadata)
    ? (record.metadata as Record<string, unknown>)
    : null;

  const idValue = record.id;
  const startedAtValue = record.started_at;
  const endedAtValue = record.ended_at;

  return {
    id:
      typeof idValue === "string"
        ? idValue
        : idValue !== undefined && idValue !== null
          ? String(idValue)
          : "",
    source: typeof record.source === "string" ? record.source : "unknown",
    ingestion_type: toIngestionType(record.ingestion_type),
    partial_reason: toStringOrNull(record.partial_reason),
    status: toStatus(record.status),
    started_at: toIsoStringOrNull(startedAtValue) ?? new Date(0).toISOString(),
    ended_at: toIsoStringOrNull(endedAtValue),
    duration_ms: toNullableNumber(record.duration_ms),
    documents_processed: toNumberOrZero(record.documents_processed),
    documents_added: toNumberOrZero(record.documents_added),
    documents_updated: toNumberOrZero(record.documents_updated),
    documents_skipped: toNumberOrZero(record.documents_skipped),
    chunks_added: toNumberOrZero(record.chunks_added),
    chunks_updated: toNumberOrZero(record.chunks_updated),
    characters_added: toNumberOrZero(record.characters_added),
    characters_updated: toNumberOrZero(record.characters_updated),
    error_count: toNumberOrZero(record.error_count),
    error_logs: normalizeErrorLogs(record.error_logs),
    metadata,
  };
}

export function normalizeRuns(data: unknown[]): RunRecord[] {
  return data.map((run) => normalizeRunRecord(run));
}
