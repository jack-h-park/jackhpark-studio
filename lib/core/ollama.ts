const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL =
  (process.env.OLLAMA_MODEL_DEFAULT ?? "mistral").trim() || "mistral";
const DEFAULT_TIMEOUT = 30_000;

const rawBaseUrl = process.env.OLLAMA_BASE_URL?.trim() ?? "";
const nodeEnv = process.env.NODE_ENV ?? "development";
const enableInProd =
  (process.env.OLLAMA_ENABLE_IN_PROD ?? "false").toLowerCase() === "true";
const resolvedBaseUrl =
  rawBaseUrl.length > 0
    ? rawBaseUrl
    : nodeEnv === "production"
      ? ""
      : DEFAULT_BASE_URL;
const timeoutMs = parseEnvNumber(
  process.env.OLLAMA_TIMEOUT_MS,
  DEFAULT_TIMEOUT,
);
const maxTokens = parseEnvNumber(process.env.OLLAMA_MAX_TOKENS, null);

const isProd = nodeEnv === "production";
const enabled = Boolean(resolvedBaseUrl) && (!isProd || enableInProd);

export type OllamaModelOption = {
  id: string;
  label: string;
};

const BASE_OLLAMA_MODELS: OllamaModelOption[] = [
  {
    id: "mistral",
    label: "Mistral (Ollama)",
  },
];

export type OllamaRuntimeConfig = {
  baseUrl: string | null;
  defaultModel: string;
  timeoutMs: number;
  maxTokens: number | null;
  enabled: boolean;
};

const runtimeConfig: OllamaRuntimeConfig = {
  baseUrl: resolvedBaseUrl || null,
  defaultModel: DEFAULT_MODEL,
  timeoutMs,
  maxTokens,
  enabled,
};

export function getOllamaRuntimeConfig(): OllamaRuntimeConfig {
  return runtimeConfig;
}

export function isOllamaEnabled(): boolean {
  return runtimeConfig.enabled;
}

export function getOllamaModels(): OllamaModelOption[] {
  return BASE_OLLAMA_MODELS;
}

export function getDefaultOllamaModelId(): string {
  return DEFAULT_MODEL;
}

function parseEnvNumber(value: string | undefined, fallback: number): number;
function parseEnvNumber(
  value: string | undefined,
  fallback: null,
): number | null;
function parseEnvNumber(
  value: string | undefined,
  fallback: number | null,
): number | null {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}
