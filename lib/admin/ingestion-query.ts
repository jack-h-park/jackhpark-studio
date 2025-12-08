import {
  INGESTION_TYPE_VALUES,
  type IngestionType,
  RUN_STATUS_VALUES,
  type RunStatus,
} from "./ingestion-runs";
import { ALL_FILTER_VALUE } from "./recent-runs-filters";

export function extractQueryValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return (
      value.find((entry) => typeof entry === "string" && entry.length > 0) ??
      null
    );
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

export function parseStatusQueryValue(
  value: string | string[] | undefined,
): RunStatus | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (extracted && RUN_STATUS_VALUES.includes(extracted as RunStatus)) {
    return extracted as RunStatus;
  }
  return ALL_FILTER_VALUE;
}

export function parseIngestionTypeQueryValue(
  value: string | string[] | undefined,
): IngestionType | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (extracted && INGESTION_TYPE_VALUES.includes(extracted as IngestionType)) {
    return extracted as IngestionType;
  }
  return ALL_FILTER_VALUE;
}

export function parseSourceQueryValue(
  value: string | string[] | undefined,
): string | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return ALL_FILTER_VALUE;
  }
  return extracted;
}

export function parseEmbeddingModelQueryValue(
  value: string | string[] | undefined,
): string | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return ALL_FILTER_VALUE;
  }
  return extracted;
}

export function parsePageQueryValue(
  value: string | string[] | undefined,
): number {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return 1;
  }
  const parsed = Number.parseInt(extracted, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export function parseDateQueryValue(
  value: string | string[] | undefined,
): string {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return "";
  }

  const parsed = new Date(extracted);
  if (Number.isNaN(parsed.getTime())) {
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(extracted)) {
      return extracted;
    }
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

export function parseBooleanQueryValue(
  value: string | string[] | undefined,
  defaultValue: boolean,
): boolean {
  const extracted = extractQueryValue(value);
  return extracted ? extracted === "true" : defaultValue;
}
