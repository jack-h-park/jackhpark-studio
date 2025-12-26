import { type ChatGuardrailConfig } from "@/lib/server/chat-guardrails";
import { stableHash } from "@/lib/server/telemetry/stable-hash";
import { type TelemetryConfigSummary } from "@/lib/server/telemetry/telemetry-config-snapshot";

export type BuildGenerationInputOptions = {
  intent?: string | null;
  resolvedModel?: string | null;
  provider?: string | null;
  presetId?: string | null;
  detailLevel?: string | null;
  guardrails?: ChatGuardrailConfig | null;
  configHash?: string | null;
  configSummary?: TelemetryConfigSummary | null;
};

export function buildGenerationInput({
  intent,
  resolvedModel,
  provider,
  presetId,
  detailLevel,
  guardrails,
  configHash,
  configSummary,
}: BuildGenerationInputOptions): Record<string, unknown> {
  const normalizedIntent =
    typeof intent === "string" && intent.trim().length > 0 ? intent : "unknown";
  const model =
    (resolvedModel ?? provider ?? "unknown").trim().length > 0
      ? (resolvedModel ?? provider ?? "unknown")
      : "unknown";
  const topK =
    normalizedIntent === "knowledge" && guardrails?.ragTopK
      ? guardrails.ragTopK
      : null;
  const summaryHash =
    typeof configHash === "string" && configHash.trim().length > 0
      ? configHash
      : configSummary
        ? stableHash(configSummary)
        : null;
  return {
    intent: normalizedIntent,
    model,
    topK,
    settings_hash:
      typeof summaryHash === "string" && summaryHash.trim().length > 0
        ? summaryHash
        : null,
    presetId: presetId ?? null,
    detailLevel: detailLevel ?? null,
  };
}

export type BuildCacheMetadataOptions = {
  intent: string;
  responseCacheEnabled: boolean;
  retrievalCacheEnabled: boolean;
  responseCacheHit: boolean | null;
  retrievalCacheHit: boolean | null;
};

export function buildCacheMetadata({
  intent,
  responseCacheEnabled,
  retrievalCacheEnabled,
  responseCacheHit,
  retrievalCacheHit,
}: BuildCacheMetadataOptions): {
  cache: {
    responseHit: boolean | null;
    retrievalHit: boolean | null;
  };
  responseCacheHit: boolean | null;
} {
  const normalizedResponseHit = responseCacheEnabled
    ? (responseCacheHit ?? null)
    : null;
  const normalizedRetrievalHit =
    retrievalCacheEnabled && intent === "knowledge"
      ? (retrievalCacheHit ?? null)
      : null;
  return {
    cache: {
      responseHit: normalizedResponseHit,
      retrievalHit: normalizedRetrievalHit,
    },
    responseCacheHit: normalizedResponseHit,
  };
}

export type ComputeRetrievalUsedOptions = {
  intent: string;
  retrievedCount?: number | null;
  finalSelectedCount?: number | null;
};

export function computeRetrievalUsed({
  intent,
  retrievedCount,
  finalSelectedCount,
}: ComputeRetrievalUsedOptions): boolean | null {
  if (intent !== "knowledge") {
    return null;
  }
  if (typeof retrievedCount === "number") {
    return retrievedCount > 0;
  }
  if (typeof finalSelectedCount === "number") {
    return finalSelectedCount > 0;
  }
  return false;
}
