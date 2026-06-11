import type { ModelProvider } from "@/lib/shared/model-provider";
import { ragLogger } from "@/lib/logging/logger";
import {
  type EmbeddingLegacyMapping,
  type EmbeddingProviderAvailability,
  type EmbeddingResolutionReason,
  type EmbeddingResolutionSnapshot,
  type EmbeddingSessionOverrideTrace,
 getEmbeddingProviderAvailability } from "@/lib/server/settings/embedding-availability";

/**
 * Serializes embedding resolution snapshots for logging. The resolution and
 * availability-enforcement logic itself lives in
 * lib/server/settings/embedding-availability.ts.
 */

export type EmbeddingResolutionTrace = {
  requestId?: string | null;
  presetKey?: string;
  requestedProvider?: ModelProvider;
  requestedModel?: string;
  requestedSpaceId?: string;
  requestedEmbeddingModel?: string;
  requestedEmbeddingSpaceId?: string;
  resolvedProvider: ModelProvider;
  resolvedModel: string;
  resolvedSpaceId: string;
  reason: EmbeddingResolutionReason;
  source?: string;
  geminiEnabled: boolean;
  openaiEnabled: boolean;
  missingGeminiKey: boolean;
  missingOpenaiKey: boolean;
  allowlist?: string[];
  sessionOverride?: EmbeddingSessionOverrideTrace;
  legacyMapping?: EmbeddingLegacyMapping;
};

export function buildEmbeddingResolutionTrace(
  snapshot: EmbeddingResolutionSnapshot,
  options?: {
    requestId?: string | null;
    presetKey?: string;
    availability?: EmbeddingProviderAvailability;
  },
): EmbeddingResolutionTrace {
  const availability =
    options?.availability ?? getEmbeddingProviderAvailability();
  return {
    requestId: options?.requestId ?? null,
    presetKey: options?.presetKey,
    requestedProvider: snapshot.requestedProvider,
    requestedModel: snapshot.requestedModel,
    requestedSpaceId: snapshot.requestedSpaceId ?? snapshot.resolvedSpaceId,
    requestedEmbeddingModel: snapshot.requestedEmbeddingModel,
    requestedEmbeddingSpaceId: snapshot.requestedEmbeddingSpaceId,
    resolvedProvider: snapshot.resolvedProvider,
    resolvedModel: snapshot.resolvedModel,
    resolvedSpaceId: snapshot.resolvedSpaceId,
    reason: snapshot.reason,
    source: snapshot.source,
    geminiEnabled: availability.geminiEnabled,
    openaiEnabled: availability.openaiEnabled,
    missingGeminiKey: availability.missingGeminiKey,
    missingOpenaiKey: availability.missingOpenaiKey,
    allowlist: snapshot.allowlist,
    sessionOverride: snapshot.sessionOverride,
    legacyMapping: snapshot.legacyMapping,
  };
}

export function logEmbeddingResolutionTrace(
  trace: EmbeddingResolutionTrace,
): void {
  ragLogger.debug("[embedding] resolution", trace);
}
