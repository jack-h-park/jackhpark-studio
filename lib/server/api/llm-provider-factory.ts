/**
 * LLM and embedding provider factory functions.
 *
 * Creates provider-specific model instances based on runtime configuration.
 * Each function uses dynamic imports to avoid loading unused provider SDKs.
 */

import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";

import type { EmbeddingSpace } from "@/lib/core/embedding-spaces";
import type { ModelProvider } from "@/lib/shared/model-provider";
import { getLmStudioRuntimeConfig } from "@/lib/core/lmstudio";
import { requireProviderApiKey } from "@/lib/core/model-provider";
import { getOllamaRuntimeConfig } from "@/lib/core/ollama";
import { OllamaUnavailableError } from "@/lib/server/ollama-provider";

export async function createEmbeddingsInstance(
  selection: EmbeddingSpace,
): Promise<EmbeddingsInterface> {
  switch (selection.provider) {
    case "openai": {
      const { OpenAIEmbeddings } = await import("@langchain/openai");
      const apiKey = requireProviderApiKey("openai");
      return new OpenAIEmbeddings({
        model: selection.model,
        apiKey,
      });
    }
    case "gemini": {
      const { GoogleGenerativeAIEmbeddings } =
        await import("@langchain/google-genai");
      const apiKey = requireProviderApiKey("gemini");
      return new GoogleGenerativeAIEmbeddings({
        model: selection.model,
        apiKey,
      });
    }
    default:
      throw new Error(`Unsupported embedding provider: ${selection.provider}`);
  }
}

export async function createChatModel(
  provider: ModelProvider,
  modelName: string,
  temperature: number,
  maxTokens: number,
): Promise<BaseLanguageModelInterface> {
  switch (provider) {
    case "openai": {
      const { ChatOpenAI } = await import("@langchain/openai");
      const apiKey = requireProviderApiKey("openai");
      return new ChatOpenAI({
        model: modelName,
        apiKey,
        temperature,
        streaming: true,
        maxTokens,
      });
    }
    case "gemini": {
      const { ChatGoogleGenerativeAI } =
        await import("@langchain/google-genai");
      const apiKey = requireProviderApiKey("gemini");
      return new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey,
        temperature,
        streaming: true,
        maxOutputTokens: maxTokens,
      });
    }
    case "lmstudio": {
      const { ChatOpenAI } = await import("@langchain/openai");
      const config = getLmStudioRuntimeConfig();
      if (!config.enabled || !config.baseUrl) {
        throw new Error("LM Studio provider is disabled or missing base URL.");
      }
      return new ChatOpenAI({
        model: modelName,
        apiKey: "lm-studio",
        configuration: {
          baseURL: config.baseUrl,
        },
        temperature,
        streaming: true,
        maxTokens,
      });
    }
    case "ollama": {
      const { ChatOllama } =
        await import("@langchain/community/chat_models/ollama");
      const config = getOllamaRuntimeConfig();
      if (!config.enabled || !config.baseUrl) {
        throw new OllamaUnavailableError(
          "Ollama provider is disabled in this environment.",
        );
      }
      return new ChatOllama({
        baseUrl: config.baseUrl,
        model: modelName ?? config.defaultModel,
        temperature,
      }) as unknown as BaseLanguageModelInterface;
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
