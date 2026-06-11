import type { ModelProvider } from "@/lib/shared/model-provider";

export interface LlmModelDefinition {
  id: string;
  label: string;
  displayName: string;
  provider: ModelProvider;
  model: string;
  aliases: readonly string[];
  isLocal: boolean;
  location: "cloud" | "local";
  localBackend?: "ollama" | "lmstudio";
  subtitle?: string;
  ollamaModel?: string;
  lmstudioModel?: string;
  // Anthropic thinking-only models (Opus 4.8/4.7, Fable) reject sampling
  // parameters (temperature/top_p/top_k) with HTTP 400. Set false on those so
  // the provider factory omits temperature. Defaults to true when unset.
  supportsSampling?: boolean;
  // Superseded models kept resolvable for back-compat but de-emphasized in the
  // admin allowlist UI. Defaults to false (active) when unset.
  deprecated?: boolean;
}

export const LLM_MODEL_DEFINITIONS: readonly LlmModelDefinition[] = [
  {
    id: "gpt-4o-mini",
    label: "OpenAI gpt-4o-mini",
    displayName: "OpenAI gpt-4o-mini",
    provider: "openai",
    model: "gpt-4o-mini",
    aliases: [
      "gpt-4o-mini",
      "openai gpt-4o-mini",
      "gpt4o-mini",
      "gpt-4o_mini",
      "openai_gpt-4o-mini",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-4o",
    label: "OpenAI gpt-4o",
    displayName: "OpenAI gpt-4o",
    provider: "openai",
    model: "gpt-4o",
    aliases: ["gpt-4o", "openai gpt-4o", "gpt4o", "openai_gpt-4o"],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-4.1-small",
    label: "OpenAI gpt-4.1-small",
    displayName: "OpenAI gpt-4.1-small",
    provider: "openai",
    model: "gpt-4.1-small",
    aliases: [
      "gpt-4.1-small",
      "gpt4.1-small",
      "openai gpt-4.1-small",
      "openai_gpt-4.1-small",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-4.1-medium",
    label: "OpenAI gpt-4.1-medium",
    displayName: "OpenAI gpt-4.1-medium",
    provider: "openai",
    model: "gpt-4.1-medium",
    aliases: [
      "gpt-4.1-medium",
      "gpt4.1-medium",
      "openai gpt-4.1-medium",
      "openai_gpt-4.1-medium",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-4.1",
    label: "OpenAI gpt-4.1",
    displayName: "OpenAI gpt-4.1",
    provider: "openai",
    model: "gpt-4.1",
    aliases: ["gpt-4.1", "gpt4.1", "openai gpt-4.1", "openai_gpt-4.1"],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-4.1-mini",
    label: "OpenAI gpt-4.1-mini",
    displayName: "OpenAI gpt-4.1-mini",
    provider: "openai",
    model: "gpt-4.1-mini",
    aliases: [
      "gpt-4.1-mini",
      "gpt4.1-mini",
      "openai gpt-4.1-mini",
      "openai_gpt-4.1-mini",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-5-4-mini",
    label: "OpenAI gpt-5-4-mini",
    displayName: "OpenAI gpt-5-4-mini",
    provider: "openai",
    model: "gpt-5-4-mini",
    aliases: [
      "gpt-5-4-mini",
      "gpt5-4-mini",
      "openai gpt-5-4-mini",
      "openai_gpt-5-4-mini",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-5-4",
    label: "OpenAI gpt-5-4",
    displayName: "OpenAI gpt-5-4",
    provider: "openai",
    model: "gpt-5-4",
    aliases: ["gpt-5-4", "gpt5-4", "openai gpt-5-4", "openai_gpt-5-4"],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-5-5",
    label: "OpenAI gpt-5-5",
    displayName: "OpenAI gpt-5-5",
    provider: "openai",
    model: "gpt-5-5",
    aliases: ["gpt-5-5", "gpt5-5", "openai gpt-5-5", "openai_gpt-5-5"],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gpt-3.5-turbo",
    label: "OpenAI gpt-3.5-turbo",
    displayName: "OpenAI gpt-3.5-turbo",
    provider: "openai",
    model: "gpt-3.5-turbo",
    deprecated: true,
    aliases: ["gpt-3.5-turbo", "gpt3.5-turbo", "openai gpt-3.5-turbo"],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gemini-1.5-flash-lite",
    label: "Gemini 1.5 Flash Lite",
    displayName: "Gemini 1.5 Flash Lite",
    provider: "gemini",
    model: "gemini-1.5-flash-lite",
    deprecated: true,
    aliases: [
      "gemini-1.5-flash-lite",
      "gemini 1.5 flash lite",
      "gemini flash lite",
      "gemini_1.5-flash-lite",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    displayName: "Gemini 1.5 Flash",
    provider: "gemini",
    model: "gemini-1.5-flash",
    deprecated: true,
    aliases: [
      "gemini-1.5-flash",
      "gemini flash",
      "gemini 1.5 flash",
      "gemini_1.5-flash",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    displayName: "Gemini 1.5 Pro",
    provider: "gemini",
    model: "gemini-1.5-pro",
    deprecated: true,
    aliases: [
      "gemini-1.5-pro",
      "gemini pro",
      "gemini 1.5 pro",
      "gemini_1.5-pro",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    displayName: "Gemini 2.0 Flash",
    provider: "gemini",
    model: "gemini-2.0-flash",
    deprecated: true,
    aliases: [
      "gemini-2.0-flash",
      "gemini flash",
      "gemini-2.0 flash",
      "google gemini 2.0 flash",
      "gemini_1.5-flash",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gemini-2.0-pro",
    label: "Gemini 2.0 Pro",
    displayName: "Gemini 2.0 Pro",
    provider: "gemini",
    model: "gemini-2.0-pro",
    deprecated: true,
    aliases: [
      "gemini-2.0-pro",
      "gemini pro",
      "google gemini 2.0 pro",
      "gemini-2.0 pro",
      "gemini_1.5-pro",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    displayName: "Gemini 2.5 Flash Lite",
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    aliases: [
      "gemini-2.5-flash-lite",
      "gemini 2.5 flash lite",
      "gemini flash lite",
      "gemini_2.5-flash-lite",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    displayName: "Gemini 2.5 Flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
    aliases: [
      "gemini-2.5-flash",
      "gemini 2.5 flash",
      "gemini_2.5-flash",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    displayName: "Gemini 3.5 Flash",
    provider: "gemini",
    model: "gemini-3.5-flash",
    aliases: [
      "gemini-3.5-flash",
      "gemini 3.5 flash",
      "gemini_3.5-flash",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "claude-opus-4-8",
    label: "Anthropic Claude Opus 4.8",
    displayName: "Anthropic Claude Opus 4.8",
    provider: "anthropic",
    model: "claude-opus-4-8",
    aliases: [
      "claude-opus-4-8",
      "claude opus 4.8",
      "opus-4-8",
      "anthropic_claude-opus-4-8",
    ],
    location: "cloud",
    isLocal: false,
    // Opus 4.8 rejects sampling params (temperature/top_p/top_k) with HTTP 400.
    supportsSampling: false,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Anthropic Claude Sonnet 4.6",
    displayName: "Anthropic Claude Sonnet 4.6",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    aliases: [
      "claude-sonnet-4-6",
      "claude sonnet 4.6",
      "sonnet-4-6",
      "anthropic_claude-sonnet-4-6",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "claude-haiku-4-5",
    label: "Anthropic Claude Haiku 4.5",
    displayName: "Anthropic Claude Haiku 4.5",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    aliases: [
      "claude-haiku-4-5",
      "claude haiku 4.5",
      "haiku-4-5",
      "anthropic_claude-haiku-4-5",
    ],
    location: "cloud",
    isLocal: false,
  },
  {
    id: "mistral-ollama",
    label: "Mistral (Ollama)",
    displayName: "Mistral (Ollama)",
    provider: "ollama",
    model: "mistral",
    aliases: ["mistral", "ollama_mistral", "ollama mistral"],
    localBackend: "ollama",
    subtitle: "mistral:latest",
    ollamaModel: "mistral:latest",
    location: "local",
    isLocal: true,
  },
  {
    id: "llama3",
    label: "Llama 3 (Ollama)",
    displayName: "Llama 3 (Ollama)",
    provider: "ollama",
    model: "llama3",
    aliases: ["llama3", "llama 3", "ollama_llama3", "ollama llama3"],
    localBackend: "ollama",
    subtitle: "llama3:instruct",
    ollamaModel: "llama3:instruct",
    location: "local",
    isLocal: true,
  },
  {
    id: "mistral-lmstudio",
    label: "Mistral (LM Studio)",
    displayName: "Mistral (LM Studio)",
    provider: "lmstudio",
    model: "mistral",
    aliases: ["lmstudio_mistral", "lmstudio mistral"],
    localBackend: "lmstudio",
    subtitle: "mistral-7b-instruct",
    lmstudioModel: "mistralai/mistral-7b-instruct-v0.3",
    location: "local",
    isLocal: true,
  },
];

export type LlmModelId = LlmModelDefinition["id"];
export const LLM_MODELS = LLM_MODEL_DEFINITIONS.map(
  (definition) => definition.id,
) as LlmModelId[];

export type EmbeddingModelDefinition = {
  id: string;
  provider: ModelProvider;
  version: string;
  model: string;
  slug: string;
  aliases?: readonly string[];
};

export const EMBEDDING_MODEL_DEFINITIONS: readonly EmbeddingModelDefinition[] =
  [
    {
      id: "text-embedding-3-small",
      provider: "openai",
      version: "v1",
      model: "text-embedding-3-small",
      slug: "te3s",
      aliases: [
        "OpenAI text-embedding-3-small (v1)",
        "openai text-embedding-3-small",
        "text-embedding-3-small",
        "openai_te3s_v1",
        "rag_chunks_openai",
        "rag_chunks_openai_te3s_v1",
        "match_chunks_openai",
        "match_chunks_openai_te3s_v1",
        "match_rag_chunks_openai",
        "match_rag_chunks_openai_te3s_v1",
      ],
    },
    {
      id: "text-embedding-004",
      provider: "gemini",
      version: "v1",
      model: "text-embedding-004",
      slug: "te4",
      aliases: [
        "Gemini text-embedding-004 (v1)",
        "gemini text-embedding-004",
        "text-embedding-004",
        "gemini_te4_v1",
        "rag_chunks_gemini",
        "rag_chunks_gemini_te4_v1",
        "match_chunks_gemini",
        "match_chunks_gemini_te4_v1",
        "match_rag_chunks_gemini",
        "match_rag_chunks_gemini_te4_v1",
      ],
    },
  ] as const;

export function normalizeEmbeddingModelSlug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
}

export function getEmbeddingSpaceId(
  provider: ModelProvider,
  modelSlug: string,
  version: string,
): string {
  const slug = normalizeEmbeddingModelSlug(modelSlug);
  const normalizedVersion = normalizeEmbeddingModelSlug(version);
  return `${provider}_${slug}_${normalizedVersion}`;
}

export function getRagChunksTableName(embeddingSpaceId: string): string {
  return `rag_chunks_${embeddingSpaceId}`;
}

export function getLcChunksViewName(embeddingSpaceId: string): string {
  return `lc_chunks_${embeddingSpaceId}`;
}

export function getMatchChunksFunctionName(embeddingSpaceId: string): string {
  return `match_native_chunks_${embeddingSpaceId}`;
}

export function getMatchLcChunksFunctionName(embeddingSpaceId: string): string {
  return `match_langchain_chunks_${embeddingSpaceId}`;
}

export type EmbeddingModelId = string;
export const EMBEDDING_MODELS = EMBEDDING_MODEL_DEFINITIONS.map(
  (definition) => definition.id,
) as EmbeddingModelId[];

export type EmbeddingSpaceId = string;

export const RANKER_OPTIONS = ["none", "mmr", "cohere-rerank"] as const;
export type RankerId = (typeof RANKER_OPTIONS)[number];

export const RANKER_DESCRIPTIONS: Record<RankerId, string> = {
  none: "No reranking",
  mmr: "Local maximal marginal relevance",
  "cohere-rerank": "Cohere rerank API",
};

export function getLlmModelDefinition(
  id: string,
): LlmModelDefinition | undefined {
  return LLM_MODEL_DEFINITIONS.find((definition) => definition.id === id);
}

export function getEmbeddingModelDefinition(
  id: string,
): EmbeddingModelDefinition | undefined {
  return EMBEDDING_MODEL_DEFINITIONS.find((definition) => definition.id === id);
}
