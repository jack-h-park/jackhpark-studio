import type { StatusPillVariant } from "@/components/ui/status-pill";

import type { RunStatus } from "./ingestion-runs";
import type { SnapshotSummary } from "./ingestion-types";
import type { SnapshotRecord } from "./rag-snapshot";

export const numberFormatter = new Intl.NumberFormat("en-US");

export const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const logTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateFormatter.format(date);
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs < 0) {
    return "--";
  }

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

export function formatCharacters(
  characters: number | null | undefined,
): string {
  if (!characters || characters <= 0) {
    return "0 chars";
  }

  const approxBytes = characters;
  const units = ["B", "KB", "MB", "GB"];
  let size = approxBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${numberFormatter.format(characters)} chars (${size.toFixed(1)} ${
    units[unitIndex]
  })`;
}

export function formatBytesFromCharacters(
  characters: number | null | undefined,
): string {
  if (!characters || characters <= 0) {
    return "—";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = characters;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatCharacterCountLabel(
  characters: number | null | undefined,
): string {
  if (!characters || characters <= 0) {
    return "0 chars";
  }
  return `${numberFormatter.format(characters)} chars`;
}

export function formatDeltaLabel(delta: number | null): string | null {
  if (delta === null || delta === 0) {
    return null;
  }
  const formatted = numberFormatter.format(Math.abs(delta));
  return delta > 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatPercentChange(
  current: number,
  previous: number,
): string | null {
  if (previous === 0) {
    return null;
  }
  const change = ((current - previous) / previous) * 100;
  if (!Number.isFinite(change) || change === 0) {
    return null;
  }
  const rounded = change.toFixed(1);
  const prefix = change > 0 ? "+" : "";
  return `${prefix}${rounded}%`;
}

export function buildSparklineData(
  values: number[],
): { path: string; min: number; max: number } | null {
  if (!values || values.length < 2) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values
    .map((value, index) => {
      const normalized = (value - min) / range;
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - normalized * 100;
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return { path, min, max };
}

export function formatKpiValue(
  value: number | null | undefined,
  format: (value: number) => string = (val) => numberFormatter.format(val),
): string {
  if (value === null || value === undefined || value === 0) {
    return "—";
  }
  return format(value);
}

export function toSnapshotSummary(snapshot: SnapshotRecord): SnapshotSummary {
  return {
    id: snapshot.id,
    capturedAt: snapshot.capturedAt,
    embeddingSpaceId: snapshot.embeddingSpaceId,
    embeddingProvider: snapshot.embeddingProvider,
    embeddingLabel: snapshot.embeddingLabel,
    runId: snapshot.runId,
    runStatus: snapshot.runStatus,
    ingestionMode: snapshot.ingestionMode,
    schemaVersion: snapshot.schemaVersion,
    totalDocuments: snapshot.totalDocuments,
    totalChunks: snapshot.totalChunks,
    totalCharacters: snapshot.totalCharacters,
    deltaDocuments: snapshot.deltaDocuments,
    deltaChunks: snapshot.deltaChunks,
    deltaCharacters: snapshot.deltaCharacters,
  };
}

export const runStatusVariantMap: Record<
  RunStatus | "unknown" | "skipped",
  StatusPillVariant
> = {
  success: "success",
  completed_with_errors: "warning",
  failed: "error",
  in_progress: "info",
  skipped: "muted",
  unknown: "muted",
};

export const SNAPSHOT_HISTORY_LIMIT = 8;
