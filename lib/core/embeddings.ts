import type { ModelProvider } from "@/lib/shared/model-provider";
import {
  type EmbeddingModelSelectionInput,
  resolveEmbeddingSpace,
} from "@/lib/core/embedding-spaces";
import {
  normalizeEmbeddingProvider,
  requireProviderApiKey,
} from "@/lib/core/model-provider";

import { getOpenAIClient } from "./openai";

type EmbedTextsOptions = EmbeddingModelSelectionInput & {
  apiKey?: string | null;
};

async function embedOpenAi(
  texts: string[],
  model: string,
  apiKeyOverride?: string | null,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const client = getOpenAIClient(apiKeyOverride ?? undefined);
  const response = await client.embeddings.create({
    model,
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}

async function embedGemini(
  texts: string[],
  model: string,
  apiKeyOverride?: string | null,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");

  const key = apiKeyOverride ?? requireProviderApiKey("gemini");
  const client = new GoogleGenerativeAI(key);
  const generativeModel = client.getGenerativeModel({ model });

  const response = await generativeModel.batchEmbedContents({
    requests: texts.map((text) => ({
      content: { role: "user", parts: [{ text }] },
    })),
  });

  const embeddings = response.embeddings ?? [];
  return embeddings.map((item) => {
    const vector = item?.values ?? [];
    return Array.from(vector);
  });
}

async function embedWithProvider(
  provider: ModelProvider,
  texts: string[],
  model: string,
  apiKeyOverride?: string | null,
): Promise<number[][]> {
  switch (provider) {
    case "openai":
      return embedOpenAi(texts, model, apiKeyOverride);
    case "gemini":
      return embedGemini(texts, model, apiKeyOverride);
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}

export async function embedTexts(
  texts: string[],
  options?: EmbedTextsOptions,
): Promise<number[][]> {
  const provider = normalizeEmbeddingProvider(options?.provider);
  const resolved = resolveEmbeddingSpace({
    provider,
    embeddingModelId: options?.embeddingModelId ?? options?.model,
    model: options?.model,
    embeddingSpaceId: options?.embeddingSpaceId,
  });
  const modelName = resolved.model;
  const apiKey = options?.apiKey ?? null;
  return embedWithProvider(resolved.provider, texts, modelName, apiKey);
}

export async function embedText(
  text: string,
  options?: EmbedTextsOptions,
): Promise<number[]> {
  const [embedding] = await embedTexts([text], options);
  return embedding ?? [];
}
