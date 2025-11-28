import type { IngestionType, RunStatus } from "@/lib/admin/ingestion-runs";
import {
  DEFAULT_EMBEDDING_SPACE_ID,
  type EmbeddingSpace,
  findEmbeddingSpace,
  listEmbeddingModelOptions,
} from "@/lib/core/embedding-spaces";

export const EMBEDDING_MODEL_OPTIONS = listEmbeddingModelOptions();
const EMBEDDING_MODEL_OPTION_MAP = new Map<string, EmbeddingSpace>(
  EMBEDDING_MODEL_OPTIONS.map((option) => [option.embeddingSpaceId, option]),
);

export const DEFAULT_MANUAL_EMBEDDING_SPACE_ID =
  EMBEDDING_MODEL_OPTION_MAP.get(DEFAULT_EMBEDDING_SPACE_ID)
    ?.embeddingSpaceId ?? DEFAULT_EMBEDDING_SPACE_ID;

export const UNKNOWN_EMBEDDING_FILTER_VALUE = "__unknown_embedding__";
export const ALL_FILTER_VALUE = "all";

const STATUS_LABELS: Record<RunStatus, string> = {
  in_progress: "In Progress",
  success: "Success",
  completed_with_errors: "Completed with Errors",
  failed: "Failed",
};

const INGESTION_TYPE_LABELS: Record<IngestionType, string> = {
  full: "Full",
  partial: "Partial",
};

export function getStatusLabel(status: RunStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function getIngestionTypeLabel(type: IngestionType): string {
  return INGESTION_TYPE_LABELS[type] ?? type;
}

export function getEmbeddingSpaceOption(
  value: string | null | undefined,
): EmbeddingSpace | null {
  if (!value) {
    return null;
  }
  return EMBEDDING_MODEL_OPTION_MAP.get(value) ?? findEmbeddingSpace(value);
}

export function formatEmbeddingSpaceLabel(
  value: string | null | undefined,
): string {
  if (!value) {
    return "Unknown model";
  }
  const option = getEmbeddingSpaceOption(value);
  return option?.label ?? value;
}

export function getEmbeddingFilterLabel(value: string): string {
  if (value === UNKNOWN_EMBEDDING_FILTER_VALUE) {
    return "Unknown";
  }
  return formatEmbeddingSpaceLabel(value);
}
