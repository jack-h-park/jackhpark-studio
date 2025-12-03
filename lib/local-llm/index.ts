import type { LocalLlmBackend, LocalLlmClient } from "./client";
import { LmStudioClient } from "./lmstudio-client";
import { OllamaClient } from "./ollama-client";

export function getLocalLlmBackend(
  override?: string,
): LocalLlmBackend | null {
  const backend = (override ?? process.env.LOCAL_LLM_BACKEND ?? "")
    .trim()
    .toLowerCase();
  if (backend === "ollama" || backend === "lmstudio") {
    return backend;
  }
  return null;
}

export function getLocalLlmClient(override?: string): LocalLlmClient | null {
  const backend = getLocalLlmBackend(override);

  if (!backend) {
    return null;
  }

  if (backend === "ollama") {
    const baseUrl = process.env.OLLAMA_BASE_URL?.trim() ??
      "http://127.0.0.1:11434";
    return new OllamaClient(baseUrl);
  }

  if (backend === "lmstudio") {
    const baseUrl = (process.env.LMSTUDIO_BASE_URL ?? "").trim() ||
      "http://127.0.0.1:1234/v1";
    const apiKey = process.env.LMSTUDIO_API_KEY?.trim();
    return new LmStudioClient(baseUrl, apiKey || undefined);
  }

  return null;
}
