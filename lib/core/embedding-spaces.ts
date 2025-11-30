import {
  MODEL_PROVIDER_LABELS,
  type ModelProvider,
  normalizeModelProvider,
  toModelProviderId,
} from "@/lib/shared/model-provider";
import {
  EMBEDDING_MODEL_DEFINITIONS,
  type EmbeddingModelDefinition,
  getEmbeddingSpaceId,
} from "@/lib/shared/models";

type EmbeddingSpace = {
  embeddingSpaceId: string;
  provider: ModelProvider;
  model: string;
  version: string;
  label: string;
  embeddingModelId: string;
  aliases: readonly string[];
};

export type EmbeddingModelSelectionInput = {
  embeddingSpaceId?: string | null;
  embeddingModelId?: string | null;
  provider?: string | null;
  model?: string | null;
  version?: string | null;
};

const getEnvValue = (keys: string[]): string | null => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

function buildEmbeddingLabel(
  provider: ModelProvider,
  model: string,
  version: string,
): string {
  const providerLabel = MODEL_PROVIDER_LABELS[provider] ?? provider;
  const versionSuffix = version ? ` (${version})` : "";
  return `${providerLabel} ${model}${versionSuffix}`;
}

export function formatEmbeddingModelDefinitionLabel(
  definition: EmbeddingModelDefinition,
): string {
  return buildEmbeddingLabel(
    definition.provider,
    definition.model,
    definition.version,
  );
}

export function formatEmbeddingSpaceLabel(space: EmbeddingSpace): string {
  return buildEmbeddingLabel(space.provider, space.model, space.version);
}

const EMBEDDING_SPACES: Record<string, EmbeddingSpace> = {};
for (const definition of EMBEDDING_MODEL_DEFINITIONS) {
  const slugSource = definition.slug ?? definition.id;
  const embeddingSpaceId = getEmbeddingSpaceId(
    definition.provider,
    slugSource,
    definition.version,
  );
  EMBEDDING_SPACES[embeddingSpaceId] = {
    embeddingSpaceId,
    provider: definition.provider,
    model: definition.model,
    version: definition.version,
    label: formatEmbeddingModelDefinitionLabel(definition),
    embeddingModelId: definition.model,
    aliases: definition.aliases ?? [],
  };
}

const EMBEDDING_ALIAS_LOOKUP = new Map<string, EmbeddingSpace>();
const normalizeKey = (value: string): string => value.toLowerCase().trim();
for (const space of Object.values(EMBEDDING_SPACES)) {
  const keys = new Set<string>([
    space.embeddingSpaceId,
    space.embeddingModelId,
    space.model,
    `${space.model}:${space.version}`,
    `${space.provider}:${space.model}`,
    `${space.provider}:${space.model}:${space.version}`,
    ...space.aliases,
  ]);
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (normalized.length === 0) continue;
    EMBEDDING_ALIAS_LOOKUP.set(normalized, space);
  }
}

const ENV_EMBEDDING_SPACE_ID = getEnvValue(["EMBEDDING_SPACE_ID"]);
const ENV_EMBEDDING_MODEL_ID = getEnvValue([
  "EMBEDDING_MODEL_ID",
  "EMBEDDING_MODEL",
]);
const ENV_EMBEDDING_VERSION = getEnvValue(["EMBEDDING_VERSION"]);

const FIRST_EMBEDDING_SPACE_ID = Object.keys(EMBEDDING_SPACES)[0] ?? "";
const DEFAULT_SPACE_FALLBACK =
  ENV_EMBEDDING_SPACE_ID ?? FIRST_EMBEDDING_SPACE_ID;
const DEFAULT_EMBEDDING_SPACE_ID = DEFAULT_SPACE_FALLBACK;
const DEFAULT_EMBEDDING_MODEL_ID =
  ENV_EMBEDDING_MODEL_ID ?? EMBEDDING_MODEL_DEFINITIONS[0]?.model ?? "";

function findById(id: string | null | undefined): EmbeddingSpace | null {
  if (!id) {
    return null;
  }
  const normalized = normalizeKey(id);
  return EMBEDDING_ALIAS_LOOKUP.get(normalized) ?? null;
}

function findByProvider(
  provider: string | null | undefined,
): EmbeddingSpace | null {
  if (!provider) {
    return null;
  }
  const normalized = normalizeModelProvider(provider);
  return (
    Object.values(EMBEDDING_SPACES).find(
      (space) => space.provider === normalized,
    ) ?? null
  );
}

function findByModelVersion(
  model?: string | null,
  version?: string | null,
  provider?: string | null,
): EmbeddingSpace | null {
  if (!model || !version) {
    return null;
  }
  const normalizedModel = model.toLowerCase().trim();
  const normalizedVersion = version.toLowerCase().trim();
  if (!normalizedModel || !normalizedVersion) {
    return null;
  }
  const providerKey = toModelProviderId(provider);
  const candidates: string[] = [`${normalizedModel}:${normalizedVersion}`];
  if (providerKey) {
    candidates.unshift(
      `${providerKey}:${normalizedModel}:${normalizedVersion}`,
    );
  }
  for (const candidate of candidates) {
    const match = EMBEDDING_ALIAS_LOOKUP.get(candidate);
    if (match) {
      return match;
    }
  }
  return null;
}

export function resolveEmbeddingSpace(
  input?: EmbeddingModelSelectionInput | string | null,
): EmbeddingSpace {
  const candidate =
    typeof input === "string"
      ? {
          embeddingSpaceId: input,
          embeddingModelId: input,
          provider: input,
          model: input,
        }
      : (input ?? {});

  const byExplicit =
    findById(candidate.embeddingSpaceId) ??
    findById(candidate.embeddingModelId) ??
    findById(candidate.model);
  if (byExplicit) {
    return byExplicit;
  }

  const byModelVersion = findByModelVersion(
    candidate.model,
    candidate.version,
    candidate.provider,
  );
  if (byModelVersion) {
    return byModelVersion;
  }

  const byProvider = findByProvider(candidate.provider);
  if (byProvider) {
    return byProvider;
  }

  const envSpace = findById(ENV_EMBEDDING_SPACE_ID);
  if (envSpace) {
    return envSpace;
  }

  const envModel = findById(ENV_EMBEDDING_MODEL_ID);
  if (envModel) {
    return envModel;
  }

  const envModelVersion = findByModelVersion(
    ENV_EMBEDDING_MODEL_ID ??
      process.env.EMBEDDING_MODEL_ID ??
      process.env.EMBEDDING_MODEL ??
      null,
    ENV_EMBEDDING_VERSION ?? process.env.EMBEDDING_VERSION ?? null,
    process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER ?? null,
  );
  if (envModelVersion) {
    return envModelVersion;
  }

  const envProvider = findByProvider(
    process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER,
  );
  if (envProvider) {
    return envProvider;
  }

  const fallback = findById(DEFAULT_EMBEDDING_SPACE_ID);
  if (fallback) {
    return fallback;
  }

  return Object.values(EMBEDDING_SPACES)[0]!;
}

export function listEmbeddingModelOptions(): EmbeddingSpace[] {
  return Object.values(EMBEDDING_SPACES);
}

export function findEmbeddingSpace(
  value: string | null | undefined,
): EmbeddingSpace | null {
  return findById(value);
}

export type { EmbeddingSpace };
export { DEFAULT_EMBEDDING_MODEL_ID, DEFAULT_EMBEDDING_SPACE_ID };
export type { EmbeddingModelId, EmbeddingSpaceId } from "@/lib/shared/models";
