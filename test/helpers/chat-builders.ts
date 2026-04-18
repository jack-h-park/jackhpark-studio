import type { ChatConfigSnapshot } from "@/lib/rag/types";
import type {
  ResponseCacheKeyArgs,
  RetrievalCacheKeyArgs,
} from "@/lib/server/api/chat-cache-keys";
import type { ChatGuardrailConfig } from "@/lib/server/chat-guardrails";
import type { ModelResolution } from "@/lib/shared/model-resolution";
import {
  buildTelemetryConfigSnapshot,
  type TelemetryConfigSummary,
} from "@/lib/server/telemetry/telemetry-config-snapshot";

type TestChatConfigSnapshotOverrides = Partial<
  Omit<
    ChatConfigSnapshot,
    "rag" | "context" | "telemetry" | "cache" | "prompt" | "guardrails"
  >
> & {
  rag?: Partial<ChatConfigSnapshot["rag"]> & {
    numericLimits?: Partial<ChatConfigSnapshot["rag"]["numericLimits"]>;
    ranking?: Partial<ChatConfigSnapshot["rag"]["ranking"]>;
  };
  context?: Partial<ChatConfigSnapshot["context"]>;
  telemetry?: Partial<ChatConfigSnapshot["telemetry"]>;
  cache?: Partial<ChatConfigSnapshot["cache"]>;
  prompt?: Partial<ChatConfigSnapshot["prompt"]>;
  guardrails?: Partial<ChatConfigSnapshot["guardrails"]>;
};

export function buildTestGuardrails(
  overrides: Partial<ChatGuardrailConfig> = {},
): ChatGuardrailConfig {
  return {
    similarityThreshold: 0.2,
    ragTopK: 5,
    ragContextTokenBudget: 1024,
    ragContextClipTokens: 256,
    historyTokenBudget: 512,
    summary: {
      enabled: true,
      triggerTokens: 400,
      maxChars: 1000,
      maxTurns: 8,
    },
    chitchatKeywords: [],
    fallbacks: {
      chitchat: "",
      command: "",
    },
    ...overrides,
  };
}

export function buildTestChatConfigSnapshot(
  overrides: TestChatConfigSnapshotOverrides = {},
): ChatConfigSnapshot {
  const base: ChatConfigSnapshot = {
    presetKey: "default",
    safeMode: false,
    llmModel: "mistral-ollama",
    embeddingModel: "text-embedding-3-small",
    rag: {
      enabled: true,
      topK: 6,
      similarity: 0.2,
      ranker: "none",
      reverseRAG: true,
      hyde: true,
      summaryLevel: "detailed",
      numericLimits: {
        ragTopK: 6,
        similarityThreshold: 0.2,
      },
      ranking: {
        docTypeWeights: { official: 1, blog: 2 },
        personaTypeWeights: { expert: 1.5 },
      },
    },
    context: {
      tokenBudget: 4096,
      historyBudget: 1024,
      clipTokens: 256,
    },
    telemetry: {
      sampleRate: 0.25,
      detailLevel: "standard",
    },
    cache: {
      responseTtlSeconds: 60,
      retrievalTtlSeconds: 120,
      responseEnabled: true,
      retrievalEnabled: true,
    },
    prompt: {
      baseVersion: "2025-01",
    },
    guardrails: {
      route: "normal",
    },
  };
  return {
    ...base,
    ...overrides,
    rag: {
      ...base.rag,
      ...overrides.rag,
      numericLimits: {
        ...base.rag.numericLimits,
        ...overrides.rag?.numericLimits,
      },
      ranking: {
        ...base.rag.ranking,
        ...overrides.rag?.ranking,
      },
    },
    context: {
      ...base.context,
      ...overrides.context,
    },
    telemetry: {
      ...base.telemetry,
      ...overrides.telemetry,
    },
    cache: {
      ...base.cache,
      ...overrides.cache,
    },
    prompt: {
      ...base.prompt,
      ...overrides.prompt,
    },
    guardrails: {
      ...base.guardrails,
      ...overrides.guardrails,
    },
  };
}

export function buildTestTelemetryConfigSummary(
  overrides: TestChatConfigSnapshotOverrides = {},
): TelemetryConfigSummary {
  return buildTelemetryConfigSnapshot(buildTestChatConfigSnapshot(overrides))
    .configSummary;
}

export function buildTestResponseCacheArgs(
  overrides: Partial<ResponseCacheKeyArgs> = {},
): ResponseCacheKeyArgs {
  return {
    presetId: "default",
    intent: "knowledge",
    messages: [{ role: "user", content: "Hi" }],
    guardrails: {
      ragTopK: 1,
      similarityThreshold: 0.5,
      ragContextTokenBudget: 100,
      ragContextClipTokens: 100,
    },
    runtimeFlags: {
      reverseRagEnabled: true,
      reverseRagMode: "precision",
      hydeEnabled: false,
      rankerMode: "none",
      hydeMode: "off",
      rewriteMode: "off",
      ragMultiQueryMode: "off",
      ragMultiQueryMaxQueries: 2,
    },
    decision: null,
    resolvedProvider: "openai",
    resolvedModelId: "gpt-4.1",
    requestedModelId: "gpt-4.1",
    summaryHash: "no-summary",
    ...overrides,
  };
}

export function buildTestRetrievalCacheArgs(
  overrides: Partial<RetrievalCacheKeyArgs> = {},
): RetrievalCacheKeyArgs {
  return {
    presetId: "default",
    question: "hello",
    ragTopK: 3,
    similarityThreshold: 0.5,
    candidateK: 15,
    reverseRagEnabled: true,
    reverseRagMode: "precision",
    hydeEnabled: false,
    rankerMode: "none",
    hydeMode: "off",
    rewriteMode: "off",
    ragMultiQueryMode: "off",
    ragMultiQueryMaxQueries: 2,
    ...overrides,
  };
}

export function buildTestModelResolution(
  modelId = "gpt-4o-mini",
): ModelResolution {
  return {
    requestedModelId: modelId,
    resolvedModelId: modelId,
    wasSubstituted: false,
    reason: "NONE",
  };
}
