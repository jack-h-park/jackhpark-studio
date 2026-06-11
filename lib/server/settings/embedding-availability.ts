import type { EmbeddingSpace } from "@/lib/core/embedding-spaces";
import type { ModelProvider } from "@/lib/shared/model-provider";
import { getProviderApiKey } from "@/lib/core/model-provider";

/**
 * Embedding provider availability and resolution-snapshot domain types.
 * These describe how an embedding space was resolved (and enforced against
 * configured API keys); telemetry only serializes the resulting snapshot
 * (see lib/server/telemetry/embedding-trace.ts).
 */

export type EmbeddingLegacyMapping = {
  from: "embeddingModel";
  to: "embeddingSpaceId";
  value: string;
  provider?: ModelProvider;
};

export type EmbeddingResolutionReason =
  | "explicit_request"
  | "session_override"
  | "preset_default"
  | "global_default"
  | "guardrail_forced"
  | "space_mapping"
  | "provider_disabled"
  | "unsupported_model"
  | "legacy_spaceid_in_embeddingModel"
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
    modelId?: string;
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
  allowlist?: string[];
  fallbackFrom?: EmbeddingFallbackInfo;
  legacyMapping?: EmbeddingLegacyMapping;
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
