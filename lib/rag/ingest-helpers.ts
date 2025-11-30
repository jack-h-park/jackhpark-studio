import { normalizeTimestamp } from "./index";

type IngestionType = "full" | "partial";

export type UnchangedInput = {
  contentHash: string | null;
  lastSourceUpdate: string | number | Date | null | undefined;
};

export type ExistingState = {
  content_hash?: string | null;
  last_source_update?: string | number | Date | null;
} | null;

export type SkipPolicyInput = {
  unchanged: boolean;
  ingestionType: IngestionType;
  providerHasChunks: boolean;
  metadataUnchanged?: boolean;
};

/**
 * Determine whether the fetched content is unchanged compared to stored state.
 * Compares hash and normalized last update timestamps if provided.
 */
export function isUnchanged(
  existingState: ExistingState,
  input: UnchangedInput,
): boolean {
  if (!existingState) {
    return false;
  }

  const { contentHash, lastSourceUpdate } = input;
  const sameHash =
    !!contentHash && existingState.content_hash === contentHash;

  const normalizedLast = normalizeTimestamp(lastSourceUpdate ?? null);
  const normalizedExisting = normalizeTimestamp(
    existingState.last_source_update ?? null,
  );

  const sameTimestamp =
    !normalizedLast || normalizedExisting === normalizedLast;

  return sameHash && sameTimestamp;
}

/**
 * Decide whether to skip ingesting based on change status, mode, and provider state.
 *
 * - partial: skip if unchanged AND chunks already exist for provider
 * - full: never skip (re-ingest even if unchanged)
 */
export function shouldSkipIngest({
  unchanged,
  ingestionType,
  providerHasChunks,
  metadataUnchanged = true,
}: SkipPolicyInput): boolean {
  return (
    decideIngestAction({
      contentUnchanged: unchanged,
      metadataUnchanged,
      ingestionType,
      providerHasChunks,
    }) === "skip"
  );
}

export type IngestDecision = "skip" | "metadata-only" | "full";

export type IngestDecisionInput = {
  contentUnchanged: boolean;
  metadataUnchanged: boolean;
  ingestionType: IngestionType;
  providerHasChunks: boolean;
};

/**
 * Decide how to handle an ingest based on content/metadata changes, mode, and provider state.
 */
export function decideIngestAction({
  contentUnchanged,
  metadataUnchanged,
  ingestionType,
  providerHasChunks,
}: IngestDecisionInput): IngestDecision {
  if (ingestionType === "full") {
    return "full";
  }

  if (contentUnchanged) {
    if (!metadataUnchanged) {
      return "metadata-only";
    }

    return providerHasChunks ? "skip" : "full";
  }

  return "full";
}
