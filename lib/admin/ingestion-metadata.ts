import { resolveEmbeddingSpace } from "../core/embedding-spaces";
import { getEmbeddingSpaceOption,UNKNOWN_EMBEDDING_FILTER_VALUE  } from "./recent-runs-filters";

export function getStringMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

export function getNumericMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function getEmbeddingSpaceIdFromMetadata(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) {
    return null;
  }

  const directKeys = [
    "embeddingSpaceId",
    "embedding_space_id",
    "embeddingModelId",
    "embedding_model_id",
    "embeddingModel",
    "embedding_model",
  ];

  for (const key of directKeys) {
    const value = getStringMetadata(metadata, key);
    if (!value) {
      continue;
    }
    const option = getEmbeddingSpaceOption(value);
    if (option) {
      return option.embeddingSpaceId;
    }
  }

  const provider =
    getStringMetadata(metadata, "embeddingProvider") ??
    getStringMetadata(metadata, "embedding_provider") ??
    null;
  const model =
    getStringMetadata(metadata, "embeddingModel") ??
    getStringMetadata(metadata, "embedding_model") ??
    getStringMetadata(metadata, "embeddingModelId") ??
    getStringMetadata(metadata, "embedding_model_id") ??
    null;
  const version =
    getStringMetadata(metadata, "embeddingVersion") ??
    getStringMetadata(metadata, "embedding_version") ??
    null;

  if (model) {
    const resolved = resolveEmbeddingSpace({
      provider,
      model,
      version,
    });
    return resolved.embeddingSpaceId;
  }

  return null;
}

export function collectSources(runs: Array<{ source?: string | null }>): string[] {
  const sourceSet = new Set<string>();
  for (const run of runs) {
    if (typeof run.source === "string" && run.source.length > 0) {
      sourceSet.add(run.source);
    }
  }
  return Array.from(sourceSet).toSorted((a, b) => a.localeCompare(b));
}

export function collectEmbeddingModels(
  runs: Array<{ metadata: Record<string, unknown> | null }>,
): string[] {
  const spaceSet = new Set<string>();
  let hasUnknown = false;
  for (const run of runs) {
    const spaceId = getEmbeddingSpaceIdFromMetadata(run.metadata);
    if (spaceId) {
      spaceSet.add(spaceId);
    } else {
      hasUnknown = true;
    }
  }
  const sorted = Array.from(spaceSet).toSorted((a, b) => a.localeCompare(b));
  if (hasUnknown) {
    sorted.push(UNKNOWN_EMBEDDING_FILTER_VALUE);
  }
  return sorted;
}

export function mergeEmbeddingModels(
  existing: string[],
  runs: Array<{ metadata: Record<string, unknown> | null }>,
): string[] {
  const spaces = new Set(existing);
  let hasUnknown = existing.includes(UNKNOWN_EMBEDDING_FILTER_VALUE);

  for (const run of runs) {
    const spaceId = getEmbeddingSpaceIdFromMetadata(run.metadata);
    if (spaceId) {
      spaces.add(spaceId);
    } else {
      hasUnknown = true;
    }
  }

  const sorted = Array.from(spaces)
    .filter((value) => value !== UNKNOWN_EMBEDDING_FILTER_VALUE)
    .toSorted((a, b) => a.localeCompare(b));

  if (hasUnknown) {
    sorted.push(UNKNOWN_EMBEDDING_FILTER_VALUE);
  }

  return sorted;
}

export function mergeSources(
  existing: string[],
  runs: Array<{ source?: string | null }>,
): string[] {
  if (runs.length === 0) {
    return existing;
  }

  const sourceSet = new Set(existing);
  for (const run of runs) {
    if (typeof run.source === "string" && run.source.length > 0) {
      sourceSet.add(run.source);
    }
  }
  return Array.from(sourceSet).toSorted((a, b) => a.localeCompare(b));
}
