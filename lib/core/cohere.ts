import { CohereClient } from "cohere-ai";

let cachedClient: CohereClient | null = null;
let cachedKey: string | null = null;

export const COHERE_RERANK_MODEL = "rerank-v3.5";

export function getCohereApiKey(): string | undefined {
  const key = process.env.COHERE_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

export function getCohereClient(): CohereClient {
  const key = getCohereApiKey();
  if (!key) {
    throw new Error(
      "Missing Cohere API key. Set the COHERE_API_KEY environment variable.",
    );
  }

  if (!cachedClient || cachedKey !== key) {
    cachedClient = new CohereClient({ token: key });
    cachedKey = key;
  }

  return cachedClient;
}
