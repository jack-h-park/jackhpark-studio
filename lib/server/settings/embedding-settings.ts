import type { ModelProvider } from "@/lib/shared/model-provider";
import type {
  AdminPresetConfig,
  EmbeddingSpaceWarning,
  SessionChatConfig,
} from "@/types/chat-config";
import { resolveEmbeddingSpace } from "@/lib/core/model-provider";
import { ragLogger } from "@/lib/logging/logger";
import {
  type EmbeddingLegacyMapping,
  type EmbeddingResolutionReason,
  type EmbeddingResolutionSnapshot,
  type EmbeddingSessionOverrideTrace,
  enforceEmbeddingProviderAvailability,
  getEmbeddingProviderAvailability,
} from "@/lib/server/telemetry/embedding-trace";

const LEGACY_EMBEDDING_SPACE_PATTERN = /^(openai|gemini)_[a-z0-9]+_v\d+$/i;

const EMPTY_EMBEDDING_SPACES: Record<
  string,
  { provider: ModelProvider; message: string }
> = {
  gemini_te4_v1: {
    provider: "gemini",
    message:
      "Selected embedding space gemini_te4_v1 has no indexed chunks; retrieval will return empty context.",
  },
};

const normalizeLegacySpaceId = (value: string): string =>
  value.trim().toLowerCase();

function deriveLegacyEmbeddingMapping(
  sessionConfig?: SessionChatConfig,
): EmbeddingLegacyMapping | undefined {
  const embeddingModel = sessionConfig?.embeddingModel;
  if (
    typeof embeddingModel !== "string" ||
    sessionConfig?.embeddingSpaceId ||
    sessionConfig?.embeddingProvider ||
    sessionConfig?.embeddingModelId
  ) {
    return undefined;
  }
  const normalized = normalizeLegacySpaceId(embeddingModel);
  if (!normalized || !LEGACY_EMBEDDING_SPACE_PATTERN.test(normalized)) {
    return undefined;
  }
  const provider: ModelProvider | undefined = normalized.startsWith("gemini_")
    ? "gemini"
    : normalized.startsWith("openai_")
      ? "openai"
      : undefined;
  return {
    from: "embeddingModel",
    to: "embeddingSpaceId",
    value: normalized,
    provider,
  };
}

export type EmbeddingSessionRequestSource =
  | "sessionConfig"
  | "sessionConfig_legacy"
  | "preset"
  | "defaults";

export type EmbeddingSessionRequest = {
  requestedEmbeddingSpaceId: string;
  requestedEmbeddingModelId?: string;
  requestedProvider?: ModelProvider;
  source: EmbeddingSessionRequestSource;
  legacyMapping?: EmbeddingLegacyMapping;
};

export function resolveSessionEmbeddingRequest({
  sessionConfig,
  preset,
  defaults,
}: {
  sessionConfig?: SessionChatConfig;
  preset?: AdminPresetConfig | null;
  defaults: { embeddingSpaceId: string };
}): EmbeddingSessionRequest {
  const legacyMapping = deriveLegacyEmbeddingMapping(sessionConfig);
  const hasSessionOverride = Boolean(
    sessionConfig?.embeddingSpaceId ||
    sessionConfig?.embeddingProvider ||
    sessionConfig?.embeddingModelId ||
    (sessionConfig?.embeddingModel && !legacyMapping),
  );
  const requestedEmbeddingSpaceId =
    sessionConfig?.embeddingSpaceId ??
    legacyMapping?.value ??
    sessionConfig?.embeddingModel ??
    preset?.embeddingModel ??
    defaults.embeddingSpaceId;
  const requestedProvider =
    sessionConfig?.embeddingProvider ?? legacyMapping?.provider;
  const source: EmbeddingSessionRequest["source"] = legacyMapping
    ? "sessionConfig_legacy"
    : hasSessionOverride
      ? "sessionConfig"
      : preset?.embeddingModel
        ? "preset"
        : "defaults";
  return {
    requestedEmbeddingSpaceId,
    requestedProvider,
    requestedEmbeddingModelId: sessionConfig?.embeddingModelId,
    source,
    legacyMapping,
  };
}

export type ResolvedEmbeddingSettings = {
  embeddingSelection: ReturnType<typeof resolveEmbeddingSpace>;
  embeddingResolutionSnapshot: EmbeddingResolutionSnapshot;
  embeddingSpaceWarnings?: EmbeddingSpaceWarning[];
};

/**
 * Resolve the effective embedding space for a request: session/preset/default
 * precedence, legacy space-id remapping, provider availability gating, and
 * the resolution snapshot consumed by telemetry.
 */
export function resolveEmbeddingSettings({
  sessionConfig,
  preset,
  presetKey,
  defaults,
  embeddingAllowlist,
}: {
  sessionConfig?: SessionChatConfig;
  preset?: AdminPresetConfig | null;
  presetKey: string;
  defaults: { embeddingSpaceId: string };
  embeddingAllowlist?: string[];
}): ResolvedEmbeddingSettings {
  const embeddingRequest = resolveSessionEmbeddingRequest({
    sessionConfig,
    preset,
    defaults,
  });
  const initialSelection = resolveEmbeddingSpace({
    embeddingSpaceId: embeddingRequest.requestedEmbeddingSpaceId,
    provider: embeddingRequest.requestedProvider,
    embeddingModelId: embeddingRequest.requestedEmbeddingModelId,
  });
  const requestedEmbeddingModel = initialSelection.model;
  const requestedEmbeddingSpaceId = embeddingRequest.requestedEmbeddingSpaceId;
  const availability = getEmbeddingProviderAvailability();
  const fallbackResult = enforceEmbeddingProviderAvailability(
    initialSelection,
    availability,
    (provider) =>
      resolveEmbeddingSpace({
        provider,
      }),
  );
  const embeddingSelection = fallbackResult.selection;
  const embeddingSpaceWarningsList: EmbeddingSpaceWarning[] = [];
  const emptySpaceInfo =
    EMPTY_EMBEDDING_SPACES[embeddingSelection.embeddingSpaceId];
  if (emptySpaceInfo) {
    ragLogger.info("[rag][embedding] space_empty", {
      spaceId: embeddingSelection.embeddingSpaceId,
      provider: embeddingSelection.provider,
      action: "warn",
    });
    embeddingSpaceWarningsList.push({
      spaceId: embeddingSelection.embeddingSpaceId,
      provider: embeddingSelection.provider,
      message: emptySpaceInfo.message,
    });
  }
  const embeddingSourceKey = embeddingRequest.source;
  let embeddingReason: EmbeddingResolutionReason =
    embeddingSourceKey === "sessionConfig_legacy"
      ? "legacy_spaceid_in_embeddingModel"
      : embeddingSourceKey === "sessionConfig"
        ? "session_override"
        : embeddingSourceKey === "preset"
          ? "preset_default"
          : "global_default";
  let embeddingSource =
    embeddingSourceKey === "sessionConfig_legacy"
      ? "sessionConfig_legacy"
      : embeddingSourceKey === "sessionConfig"
        ? "sessionConfig"
        : embeddingSourceKey === "preset"
          ? `preset:${presetKey}`
          : "defaults";
  if (fallbackResult.reason === "provider_disabled") {
    embeddingReason = "provider_disabled";
    embeddingSource = "provider-gating";
  }
  const sessionEmbeddingProvider = sessionConfig?.embeddingProvider ?? undefined;
  const sessionEmbeddingModel = sessionConfig?.embeddingModel ?? undefined;
  const sessionEmbeddingSpaceId =
    sessionConfig?.embeddingSpaceId ??
    sessionConfig?.embeddingModelId ??
    undefined;
  const sessionEmbeddingModelId = sessionConfig?.embeddingModelId ?? undefined;
  const sessionPresetKey = sessionConfig?.presetId ?? undefined;
  const sessionAppliedPreset = sessionConfig?.appliedPreset ?? undefined;
  const sessionOverrideRaw: EmbeddingSessionOverrideTrace["raw"] = {};
  const sessionOverrideKeys: string[] = [];
  if (sessionEmbeddingProvider) {
    sessionOverrideRaw.provider = sessionEmbeddingProvider;
    sessionOverrideKeys.push("sessionConfig.embeddingProvider");
  }
  if (sessionEmbeddingModel) {
    sessionOverrideRaw.model = sessionEmbeddingModel;
    sessionOverrideKeys.push("sessionConfig.embeddingModel");
  }
  if (sessionEmbeddingModelId) {
    sessionOverrideRaw.modelId = sessionEmbeddingModelId;
    sessionOverrideKeys.push("sessionConfig.embeddingModelId");
  }
  if (sessionEmbeddingSpaceId) {
    sessionOverrideRaw.spaceId = sessionEmbeddingSpaceId;
    sessionOverrideKeys.push("sessionConfig.embeddingSpaceId");
  }
  if (sessionPresetKey) {
    sessionOverrideRaw.presetKey = sessionPresetKey;
    sessionOverrideKeys.push("sessionConfig.presetId");
  }
  if (sessionAppliedPreset) {
    sessionOverrideRaw.appliedPreset = sessionAppliedPreset;
    sessionOverrideKeys.push("sessionConfig.appliedPreset");
  }
  const legacyMappingNote = embeddingRequest.legacyMapping
    ? `legacy mapping applied (${embeddingRequest.legacyMapping.value})`
    : undefined;
  const baseOverrideNote =
    sessionOverrideKeys.length > 0
      ? `sessionConfig priority (${sessionOverrideKeys.join(", ")}) overrode ${embeddingSource}`
      : undefined;
  const sessionOverrideNote = legacyMappingNote
    ? baseOverrideNote
      ? `${baseOverrideNote}; ${legacyMappingNote}`
      : legacyMappingNote
    : baseOverrideNote;
  const sessionOverride =
    Object.keys(sessionOverrideRaw).length > 0
      ? {
          raw: sessionOverrideRaw,
          applied: {
            provider: embeddingSelection.provider,
            model: embeddingSelection.model,
            spaceId: embeddingSelection.embeddingSpaceId,
          },
          note:
            sessionOverrideNote ??
            "sessionConfig override priority: sessionConfig > preset > defaults",
        }
      : undefined;
  const embeddingResolutionSnapshot: EmbeddingResolutionSnapshot = {
    requestedModel: requestedEmbeddingModel ?? undefined,
    requestedSpaceId: requestedEmbeddingSpaceId ?? undefined,
    requestedEmbeddingModel: requestedEmbeddingModel ?? undefined,
    requestedEmbeddingSpaceId: requestedEmbeddingSpaceId ?? undefined,
    requestedProvider: embeddingRequest.requestedProvider,
    legacyMapping: embeddingRequest.legacyMapping,
    resolvedProvider: embeddingSelection.provider,
    resolvedModel: embeddingSelection.model,
    resolvedSpaceId: embeddingSelection.embeddingSpaceId,
    reason: embeddingReason,
    source: embeddingSource,
    allowlist: embeddingAllowlist,
    fallbackFrom: fallbackResult.fallbackFrom,
    sessionOverride,
  };

  return {
    embeddingSelection,
    embeddingResolutionSnapshot,
    embeddingSpaceWarnings:
      embeddingSpaceWarningsList.length > 0
        ? embeddingSpaceWarningsList
        : undefined,
  };
}
