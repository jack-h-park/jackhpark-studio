import { normalizeLlmModelId } from "@/lib/core/llm-registry";
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
  ollamaConfigured: boolean;
  lmstudioConfigured: boolean;
  defaultModelId: string;
  defaultModelExplicit?: boolean;
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

function pickDefaultModelId(ctx: ModelResolutionContext): {
  modelId: string;
  reason: ModelResolutionReason;
} | null {
  // Strict mode: Only fallback if explicitly defined in environment
  if (ctx.defaultModelExplicit) {
    return { modelId: ctx.defaultModelId, reason: "UNKNOWN_MODEL" };
  }

  // If not explicit, do not fallback
  return null;
}

function isLocalModelDefinition(definition: LlmModelDefinition): boolean {
  return definition.isLocal;
}

function isBackendDisabled(
  definition: LlmModelDefinition,
  ctx: ModelResolutionContext,
): boolean {
  if (definition.localBackend === "ollama") {
    return !ctx.ollamaConfigured;
  }
  if (definition.localBackend === "lmstudio") {
    return !ctx.lmstudioConfigured;
  }
  return false;
}

export function isOllamaModelId(modelId: string | null | undefined): boolean {
  const definition = findModelDefinition(modelId);
  return Boolean(definition && isLocalModelDefinition(definition));
}

export function resolveLlmModelId(
  requestedModelId: string,
  ctx: ModelResolutionContext,
): ModelResolution {
  const normalizedRequest =
    normalizeLlmModelId(requestedModelId) ?? ctx.defaultModelId;
  const requested =
    normalizedRequest.length > 0 ? normalizedRequest : ctx.defaultModelId;

  const definition = findModelDefinition(requested);
  const allowlist = ctx.allowedModelIds
    ? new Set(ctx.allowedModelIds.map((id) => id.toLowerCase()))
    : null;

  if (!definition) {
    const fallback = pickDefaultModelId(ctx);
    if (!fallback) {
      return {
        requestedModelId: requested,
        resolvedModelId: requested,
        wasSubstituted: false,
        reason: "NONE",
      };
    }
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
    if (!fallback) {
      return {
        requestedModelId: canonicalId,
        resolvedModelId: canonicalId,
        wasSubstituted: false,
        reason: "NONE",
      };
    }
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

  if (
    isLocalModelDefinition(definition) &&
    isBackendDisabled(definition, ctx)
  ) {
    const fallback = pickDefaultModelId(ctx);
    if (!fallback) {
      return {
        requestedModelId: canonicalId,
        resolvedModelId: canonicalId,
        wasSubstituted: false,
        reason: "LOCAL_LLM_DISABLED",
      };
    }
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
