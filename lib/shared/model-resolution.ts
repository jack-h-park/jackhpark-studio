import {
  LLM_MODEL_DEFINITIONS,
  type LlmModelDefinition,
  type LlmModelId,
} from "@/lib/shared/models";

export type ModelResolutionReason =
  | "LOCAL_LLM_DISABLED"
  | "NOT_IN_ALLOWLIST"
  | "UNKNOWN_MODEL"
  | "NONE";

export type ModelResolution = {
  requestedModelId: string;
  resolvedModelId: string;
  wasSubstituted: boolean;
  reason: ModelResolutionReason;
};

export type ModelResolutionContext = {
  ollamaEnabled: boolean;
  lmstudioEnabled: boolean;
  defaultModelId: string;
  allowedModelIds?: readonly string[];
};

type ModelLookupEntry = {
  key: string;
  definition: LlmModelDefinition;
};

const MODEL_LOOKUP: ModelLookupEntry[] = LLM_MODEL_DEFINITIONS.flatMap(
  (definition) => {
    const keys = new Set<string>([
      definition.id,
      definition.model,
      definition.label,
      ...definition.aliases,
    ]);
    return Array.from(keys).map((key) => ({
      key: key.toLowerCase(),
      definition,
    }));
  },
);

function findModelDefinition(
  value: string | null | undefined,
): LlmModelDefinition | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (
    MODEL_LOOKUP.find((entry) => entry.key === normalized)?.definition ?? null
  );
}

function pickDefaultModelId(
  ctx: ModelResolutionContext,
): { modelId: string; reason: ModelResolutionReason } {
  const fallbackFromAllowlist = ctx.allowedModelIds?.[0];
  if (fallbackFromAllowlist) {
    return { modelId: fallbackFromAllowlist, reason: "NOT_IN_ALLOWLIST" };
  }
  return { modelId: ctx.defaultModelId, reason: "UNKNOWN_MODEL" };
}

function isLocalModelDefinition(definition: LlmModelDefinition): boolean {
  return Boolean(definition.localBackend);
}

function isBackendDisabled(
  definition: LlmModelDefinition,
  ctx: ModelResolutionContext,
): boolean {
  if (definition.localBackend === "ollama") {
    return !ctx.ollamaEnabled;
  }
  if (definition.localBackend === "lmstudio") {
    return !ctx.lmstudioEnabled;
  }
  return false;
}

export function isOllamaModelId(modelId: string | null | undefined): boolean {
  const definition = findModelDefinition(modelId);
  return Boolean(
    definition && isLocalModelDefinition(definition),
  );
}

export function resolveLlmModelId(
  requestedModelId: string,
  ctx: ModelResolutionContext,
): ModelResolution {
  const normalizedRequest = requestedModelId?.trim() ?? "";
  const requested =
    normalizedRequest.length > 0 ? normalizedRequest : ctx.defaultModelId;

  const definition = findModelDefinition(requested);
  const allowlist = ctx.allowedModelIds
    ? new Set(ctx.allowedModelIds.map((id) => id.toLowerCase()))
    : null;

  if (!definition) {
    const fallback = pickDefaultModelId(ctx);
    const resolvedId =
      allowlist && !allowlist.has(fallback.modelId.toLowerCase())
        ? ctx.defaultModelId
        : fallback.modelId;
    return {
      requestedModelId: requested,
      resolvedModelId: resolvedId,
      wasSubstituted: true,
      reason: "UNKNOWN_MODEL",
    };
  }

  const canonicalId = definition.id as LlmModelId;
  if (allowlist && !allowlist.has(canonicalId.toLowerCase())) {
    const fallback = pickDefaultModelId(ctx);
    const resolvedId =
      allowlist && allowlist.has(fallback.modelId.toLowerCase())
        ? fallback.modelId
        : fallback.modelId;
    return {
      requestedModelId: canonicalId,
      resolvedModelId: resolvedId,
      wasSubstituted: resolvedId !== canonicalId,
      reason: "NOT_IN_ALLOWLIST",
    };
  }

  if (isLocalModelDefinition(definition) && isBackendDisabled(definition, ctx)) {
    const fallback = pickDefaultModelId(ctx);
    const resolvedId =
      allowlist && allowlist.has(fallback.modelId.toLowerCase())
        ? fallback.modelId
        : fallback.modelId;
    return {
      requestedModelId: canonicalId,
      resolvedModelId: resolvedId,
      wasSubstituted: resolvedId !== canonicalId,
      reason: "LOCAL_LLM_DISABLED",
    };
  }

  return {
    requestedModelId: canonicalId,
    resolvedModelId: canonicalId,
    wasSubstituted: false,
    reason: "NONE",
  };
}
