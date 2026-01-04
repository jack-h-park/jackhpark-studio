import type { EmbeddingSpace } from "@/lib/core/embedding-spaces";
import { getProviderApiKey } from "@/lib/core/model-provider";
import { ragLogger } from "@/lib/logging/logger";
import type { ModelProvider } from "@/lib/shared/model-provider";

export type EmbeddingResolutionReason =
  | "explicit_request"
  | "session_override"
  | "preset_default"
  | "global_default"
  | "guardrail_forced"
  | "space_mapping"
  | "provider_disabled"
  | "unsupported_model"
  | "unknown";

export type EmbeddingProviderAvailability = {
  openaiEnabled: boolean;
  geminiEnabled: boolean;
  missingOpenaiKey: boolean;
  missingGeminiKey: boolean;
};

export type EmbeddingFallbackInfo = {
  provider: ModelProvider;
  model: string;
  embeddingSpaceId: string;
};

export type EmbeddingSessionOverrideTrace = {
  raw: {
    provider?: string;
    model?: string;
    spaceId?: string;
    presetKey?: string;
    appliedPreset?: string;
  };
  applied: {
    provider: ModelProvider;
    model: string;
    spaceId: string;
  };
  note: string;
};

export type EmbeddingResolutionSnapshot = {
  requestedProvider?: string;
  requestedModel?: string;
  requestedSpaceId?: string;
  requestedEmbeddingModel?: string;
  requestedEmbeddingSpaceId?: string;
  resolvedProvider: ModelProvider;
  resolvedModel: string;
  resolvedSpaceId: string;
  reason: EmbeddingResolutionReason;
  source?: string;
  allowlist?: string[];
  fallbackFrom?: EmbeddingFallbackInfo;
  sessionOverride?: EmbeddingSessionOverrideTrace;
};

export type EmbeddingResolutionTrace = {
  requestId?: string | null;
  presetKey?: string;
  requestedProvider?: string;
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
};

export type EnforceEmbeddingProviderAvailabilityResult = {
  selection: EmbeddingSpace;
  reason?: EmbeddingResolutionReason;
  fallbackFrom?: EmbeddingFallbackInfo;
};

export function getEmbeddingProviderAvailability(): EmbeddingProviderAvailability {
  const openaiKey = getProviderApiKey("openai");
  const geminiKey = getProviderApiKey("gemini");
  const openaiEnabled = Boolean(openaiKey);
  const geminiEnabled = Boolean(geminiKey);
  return {
    openaiEnabled,
    geminiEnabled,
    missingOpenaiKey: !openaiEnabled,
    missingGeminiKey: !geminiEnabled,
  };
}

export function enforceEmbeddingProviderAvailability(
  selection: EmbeddingSpace,
  availability: EmbeddingProviderAvailability,
  selectFallback: (provider: ModelProvider) => EmbeddingSpace | null,
): EnforceEmbeddingProviderAvailabilityResult {
  const disabledGemini =
    selection.provider === "gemini" && !availability.geminiEnabled;
  if (disabledGemini && availability.openaiEnabled) {
    const fallback = selectFallback("openai");
    if (fallback) {
      return {
        selection: fallback,
        reason: "provider_disabled",
        fallbackFrom: {
          provider: selection.provider,
          model: selection.model,
          embeddingSpaceId: selection.embeddingSpaceId,
        },
      };
    }
  }
  const disabledOpenai =
    selection.provider === "openai" && !availability.openaiEnabled;
  if (disabledOpenai && availability.geminiEnabled) {
    const fallback = selectFallback("gemini");
    if (fallback) {
      return {
        selection: fallback,
        reason: "provider_disabled",
        fallbackFrom: {
          provider: selection.provider,
          model: selection.model,
          embeddingSpaceId: selection.embeddingSpaceId,
        },
      };
    }
  }
  return { selection };
}

export function buildEmbeddingResolutionTrace(
  snapshot: EmbeddingResolutionSnapshot,
  options?: {
    requestId?: string | null;
    presetKey?: string;
    availability?: EmbeddingProviderAvailability;
  },
): EmbeddingResolutionTrace {
  const availability = options?.availability ?? getEmbeddingProviderAvailability();
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
  };
}

export function logEmbeddingResolutionTrace(trace: EmbeddingResolutionTrace): void {
  ragLogger.debug("[embedding] resolution", trace);
}
