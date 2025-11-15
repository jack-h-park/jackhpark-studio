import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { type CoreMessage, streamText } from "ai";

import { getDefaultOllamaModelId } from "@/lib/core/ollama";
import {
  getAppEnv,
  observe,
  telemetry,
  updateActiveObservation,
  updateActiveTrace,
} from "@/lib/langfuse";
import { ollamaModel } from "@/lib/ollama-provider";
import { type ModelProvider, normalizeModelProvider } from "@/lib/shared/model-provider";

export const runtime = "nodejs";

type ChatRequestBody = {
  chatId: string;
  userId?: string;
  messages: CoreMessage[];
  provider?: string;
  model?: string;
};

type RetrievedDocument = {
  docId: string;
  score: number;
  sourceType?: string;
  metadata?: Record<string, unknown>;
};

const CLIENT_NAME = "chat-panel";
const reverseRagEnabled = true;
const hydeEnabled = true;
const rerankerEnabled = false;

const handler = async (req: Request): Promise<Response> => {
  let body: ChatRequestBody;

  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const { chatId, userId, messages } = body ?? {};

  if (!chatId || !Array.isArray(messages) || messages.length === 0) {
    return new Response("chatId and messages are required", { status: 400 });
  }

  const env = getAppEnv();
  const provider = normalizeModelProvider(
    typeof body.provider === "string" ? body.provider : undefined,
    "ollama",
  );
  const { identifier: generationModelIdentifier, model: generationModel } =
    resolveLanguageModel(provider, body.model);
  const lastUserMessage = extractLastUserMessage(messages);
  const traceActive = telemetry.isTraceActive();

  // Trace metadata for the entire chat turn.
  if (traceActive) {
    updateActiveTrace({
      name: "rag-chat-turn",
      sessionId: chatId,
      userId,
      input: lastUserMessage,
      metadata: {
        env,
        client: CLIENT_NAME,
        provider,
        model: generationModelIdentifier,
      },
    });
  }

  const rewrittenQuery = reverseRagEnabled
    ? rewriteQueryForReverseRag(lastUserMessage)
    : lastUserMessage;

  // Reverse RAG: rewrite the user query to improve recall.
  if (traceActive && reverseRagEnabled) {
    updateActiveObservation({
      input: lastUserMessage,
      output: rewrittenQuery,
      metadata: {
        env,
        type: "reverse_rag",
        model: generationModelIdentifier,
        stage: "reverse-rag-rewriter",
      },
    });
  }

  const hydeDocs = hydeEnabled ? buildHypotheticalDocs(rewrittenQuery) : [];
  // HyDE: generate hypothetical documents to enrich retrieval recall.
  if (traceActive) {
    updateActiveObservation({
      input: rewrittenQuery,
      output: hydeDocs,
      metadata: {
        env,
        enabled: hydeEnabled,
        numDocs: hydeDocs.length,
        model: generationModelIdentifier,
        stage: "hyde",
      },
    });
  }

  const retrievalQuery = hydeDocs.length > 0 ? rewrittenQuery : lastUserMessage;
  const retrievedDocs = retrieveDocuments(retrievalQuery);

  // Retrieval step: log which documents were selected for grounding.
  if (traceActive) {
    updateActiveObservation({
      input: retrievalQuery,
      output: retrievedDocs,
      metadata: {
        env,
        source: "supabase_pgvector",
        k: retrievedDocs.length,
        results: retrievedDocs,
        stage: "retrieval",
      },
    });
  }

  const rerankedDocs = rerankDocuments(retrievedDocs);
  // Future reranker placeholder – retains structure for Cohere or similar rerankers.
  if (traceActive) {
    updateActiveObservation({
      input: retrievedDocs,
      output: rerankedDocs,
      metadata: {
        env,
        enabled: rerankerEnabled,
        provider: rerankerEnabled ? "cohere" : undefined,
        model: rerankerEnabled ? "cohere.rerank-3" : undefined,
        topK: rerankedDocs.length,
        results: rerankedDocs,
        stage: "reranker",
      },
    });
  }

  // Generation metadata: capture which model + strategy was selected.
  if (traceActive) {
    updateActiveObservation({
      input: {
        query: retrievalQuery,
        context: rerankedDocs,
      },
      metadata: {
        env,
        chosenModel: generationModelIdentifier,
        provider,
        modelStrategy: "auto",
        reverseRagEnabled,
        hydeEnabled,
        rerankerEnabled,
        stage: "generation",
      },
    });
  }

  const result = streamText({
    model: generationModel,
    system:
      "You are a helpful assistant that cites retrieved documents when possible.",
    messages,
    experimental_telemetry: {
      isEnabled: traceActive,
    },
  });

  // Guardrail step: record checks on the raw LLM output once streaming completes.
  if (traceActive) {
    result.text
      .then((rawOutput) => {
        const guardrailResult = applyGuardrail(rawOutput);
        updateActiveObservation({
          input: rawOutput,
          output: guardrailResult.sanitizedOutput,
          metadata: {
            env,
            inputChecks: guardrailResult.inputChecks,
            outputChecks: guardrailResult.outputChecks,
            finalDecision: guardrailResult.finalDecision,
            actions: guardrailResult.actions,
            stage: "guardrail",
          },
        });
      })
      .catch((err) => {
        console.error("Guardrail observation failed", err);
      });
  }

  return result.toTextStreamResponse();
};

export const POST = observe(handler, {
  name: "chat-handler",
  endOnExit: false,
});

function extractLastUserMessage(messages: CoreMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return serializeMessageContent(messages[i]?.content);
    }
  }

  return "";
}

function serializeMessageContent(content: CoreMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (typeof part === "object" && part !== null && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }

        return JSON.stringify(part);
      })
      .join(" ");
  }

  if (typeof content === "object" && "text" in content) {
    return String((content as { text?: string }).text ?? "");
  }

  return JSON.stringify(content);
}

function rewriteQueryForReverseRag(query: string): string {
  if (!query) {
    return "";
  }

  return `Rewrite: ${query}`.trim();
}

function buildHypotheticalDocs(query: string) {
  if (!query) {
    return [];
  }

  return [
    {
      id: "hyde-1",
      snippet: `Hypothetical supporting evidence for "${query}".`,
    },
    {
      id: "hyde-2",
      snippet: `Concise summary explaining "${query}".`,
    },
  ];
}

function retrieveDocuments(query: string): RetrievedDocument[] {
  if (!query) {
    return [];
  }

  return [
    {
      docId: "doc-1",
      score: 0.83,
      sourceType: "notion",
      metadata: {
        title: "Getting started",
        url: "https://example.com/doc-1",
      },
    },
    {
      docId: "doc-2",
      score: 0.74,
      sourceType: "notion",
      metadata: {
        title: "Advanced usage",
        url: "https://example.com/doc-2",
      },
    },
  ];
}

function rerankDocuments(documents: RetrievedDocument[]): RetrievedDocument[] {
  if (!documents.length || !rerankerEnabled) {
    return documents;
  }

  return documents
    .map((doc, idx) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        rerankPosition: idx + 1,
      },
    }))
    .slice(0, 3);
}

function applyGuardrail(rawOutput: string) {
  const sanitizedOutput = rawOutput;
  const mockCheck = {
    name: "toxicity",
    result: "pass",
    score: 0.02,
    details: "No unsafe content detected",
  };

  return {
    sanitizedOutput,
    finalDecision: "allow" as const,
    actions: [] as string[],
    inputChecks: [mockCheck],
    outputChecks: [mockCheck],
  };
}

function resolveLanguageModel(provider: ModelProvider, requestedModel?: string) {
  const modelId = normalizeModelId(provider, requestedModel);

  if (provider === "gemini") {
    return { identifier: `gemini:${modelId}`, model: google(modelId) };
  }

  if (provider === "ollama") {
    return { identifier: `ollama:${modelId}`, model: ollamaModel(modelId) };
  }

  return { identifier: `openai:${modelId}`, model: openai(modelId) };
}

function normalizeModelId(provider: ModelProvider, requestedModel?: string): string {
  const trimmed = typeof requestedModel === "string" ? requestedModel.trim() : "";
  if (trimmed) {
    return trimmed;
  }

  if (provider === "gemini") {
    return process.env.VERCEL_AI_GEMINI_MODEL ?? "gemini-1.5-pro";
  }

  if (provider === "ollama") {
    return getDefaultOllamaModelId();
  }

  return process.env.VERCEL_AI_OPENAI_MODEL ?? "gpt-4o-mini";
}
