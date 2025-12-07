import { isLmStudioEnabled } from "@/lib/core/lmstudio";
import { isOllamaEnabled } from "@/lib/core/ollama";
import { normalizeModelProvider } from "@/lib/shared/model-provider";
import {
  LLM_MODEL_DEFINITIONS,
  type LlmModelDefinition,
} from "@/lib/shared/models";

type LlmModelOption = LlmModelDefinition;

type LlmModelInput = {
  modelId?: string | null;
  provider?: string | null;
  model?: string | null;
};

const mapToOption = (definition: LlmModelDefinition): LlmModelOption =>
  definition;

const isDefinitionEnabled = (definition: LlmModelDefinition) => {
  if (definition.localBackend === "ollama") {
    return isOllamaEnabled();
  }
  if (definition.localBackend === "lmstudio") {
    return isLmStudioEnabled();
  }
  return true;
};

const ALL_LLM_MODEL_OPTIONS = LLM_MODEL_DEFINITIONS.map(mapToOption);
const AVAILABLE_LLM_MODEL_OPTIONS = LLM_MODEL_DEFINITIONS.filter(
  isDefinitionEnabled,
).map(mapToOption);

const ENV_DEFAULT_LLM_MODEL = process.env.DEFAULT_LLM_MODEL?.trim();
const DEFAULT_LLM_MODEL_ID =
  ENV_DEFAULT_LLM_MODEL && ENV_DEFAULT_LLM_MODEL.length > 0
    ? ENV_DEFAULT_LLM_MODEL
    : "gpt-4o-mini";

/**
 * Normalize deprecated or shorthand model IDs so downstream code always sees the canonical value.
 */
export function normalizeLlmModelId(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.toLowerCase() === "mistral") {
    return "mistral-ollama";
  }
  return trimmed;
}

const LLM_ALIAS_LOOKUP = new Map<string, LlmModelOption>();
for (const option of ALL_LLM_MODEL_OPTIONS) {
  const keys = new Set<string>([
    option.id,
    option.label,
    ...option.aliases,
    option.model,
  ]);
  for (const key of keys) {
    LLM_ALIAS_LOOKUP.set(key.toLowerCase(), option);
  }
}

function findByProvider(
  provider: string | null | undefined,
): LlmModelOption | null {
  if (!provider) {
    return null;
  }
  const normalized = normalizeModelProvider(provider);
  return (
    AVAILABLE_LLM_MODEL_OPTIONS.find(
      (entry) => entry.provider === normalized,
    ) ??
    ALL_LLM_MODEL_OPTIONS.find((entry) => entry.provider === normalized) ??
    null
  );
}

function findById(value: string | null | undefined): LlmModelOption | null {
  if (!value) return null;
  const normalized = normalizeLlmModelId(value);
  if (!normalized) return null;
  const key = normalized.toLowerCase();
  return LLM_ALIAS_LOOKUP.get(key) ?? null;
}

export function resolveLlmModel(
  input?: LlmModelInput | string | null,
): LlmModelOption {
  const candidate: LlmModelInput =
    typeof input === "string"
      ? { modelId: input, provider: input, model: input }
      : (input ?? {});

  const byId = findById(candidate.modelId) ?? findById(candidate.model);
  if (byId) {
    return byId;
  }

  const byProvider = findByProvider(candidate.provider);
  if (byProvider) {
    return byProvider;
  }

  const envModel = findById(process.env.DEFAULT_LLM_MODEL ?? null);
  if (envModel) {
    return envModel;
  }

  const envProviderModel = findByProvider(process.env.LLM_PROVIDER ?? null);
  if (envProviderModel) {
    return envProviderModel;
  }

  return (
    findById(DEFAULT_LLM_MODEL_ID) ??
    AVAILABLE_LLM_MODEL_OPTIONS[0] ??
    ALL_LLM_MODEL_OPTIONS[0]!
  );
}

export function listLlmModelOptions(): LlmModelOption[] {
  return [...AVAILABLE_LLM_MODEL_OPTIONS];
}

export function findLlmModelOption(
  value: string | null | undefined,
): LlmModelOption | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase().trim();
  return LLM_ALIAS_LOOKUP.get(normalized) ?? null;
}

export type { LlmModelOption };
export { DEFAULT_LLM_MODEL_ID };
export type { LlmModelId } from "@/lib/shared/models";
