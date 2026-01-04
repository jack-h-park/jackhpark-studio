import { isLmStudioConfigured } from "@/lib/core/lmstudio";
import { isOllamaConfigured } from "@/lib/core/ollama";

export type ModelProvider = "openai" | "gemini" | "ollama" | "lmstudio";

const BASE_MODEL_PROVIDERS: ModelProvider[] = ["openai", "gemini"];
const LOCAL_MODEL_PROVIDERS: ModelProvider[] = [
  ...(isOllamaConfigured() ? ["ollama" as const] : []),
  ...(isLmStudioConfigured() ? ["lmstudio" as const] : []),
];

export const MODEL_PROVIDERS: readonly ModelProvider[] = [
  ...BASE_MODEL_PROVIDERS,
  ...LOCAL_MODEL_PROVIDERS,
];

export const MODEL_PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini (Google)",
  ollama: "Ollama (local)",
  lmstudio: "LM Studio (local)",
};

const PROVIDER_ALIASES: Record<string, ModelProvider> = {
  openai: "openai",
  oa: "openai",
  "open-ai": "openai",
  gpt: "openai",
  chatgpt: "openai",

  gemini: "gemini",
  google: "gemini",
  "google-ai": "gemini",
  "google-ai-studio": "gemini",

  ollama: "ollama",
  local: "ollama",
  lmstudio: "lmstudio",
  "lm-studio": "lmstudio",
  "lm studio": "lmstudio",
  "local-lmstudio": "lmstudio",
};

export function toModelProviderId(
  value: string | null | undefined,
): ModelProvider | null {
  if (!value) {
    return null;
  }

  const key = value.toLowerCase().trim();
  return PROVIDER_ALIASES[key] ?? null;
}

export function normalizeModelProvider(
  value: string | null | undefined,
  fallback: ModelProvider = "openai",
): ModelProvider {
  return toModelProviderId(value) ?? fallback;
}

export function isModelProvider(value: unknown): value is ModelProvider {
  if (typeof value !== "string") {
    return false;
  }

  return MODEL_PROVIDERS.includes(value as ModelProvider);
}
