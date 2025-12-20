import type { RunnableConfig } from "@langchain/core/runnables";

import type { EmbeddingSpace } from "@/lib/core/embedding-spaces";
import type { GuardrailRoute } from "@/lib/rag/types";
import type { ModelProvider } from "@/lib/shared/model-provider";
import type { TelemetryDecision } from "@/lib/telemetry/chat-langfuse";

export type ChainRunContext = {
  requestId?: string | null;
  sessionId?: string | null;
  intent?: string;
  guardrailRoute?: GuardrailRoute;
  provider: ModelProvider;
  llmModel: string;
  presetId?: string | null;
  embeddingSelection?: EmbeddingSpace | null;
  telemetryDecision?: TelemetryDecision;
  traceId?: string | null;
  langfuseTraceId?: string | null;
  stage?: string;
  stageDetail?: string;
};

export function makeRunName(base: string, stage?: string): string {
  const normalizedBase = base?.trim() ?? "";
  if (stage === undefined || stage === null) {
    return normalizedBase || "run";
  }
  const normalizedStage = stage.trim();
  if (!normalizedStage) {
    return normalizedBase || "run";
  }
  if (!normalizedBase) {
    return normalizedStage;
  }
  return `${normalizedBase}:${normalizedStage}`;
}

export function buildChainRunnableConfig(ctx: ChainRunContext): RunnableConfig {
  const intentTag = ctx.intent ?? "intent:unknown";
  const providerTag = ctx.provider;
  const tagSet = new Set<string>(["langchain", "rag", intentTag, providerTag]);

  if (ctx.guardrailRoute) {
    tagSet.add(`guardrail:${ctx.guardrailRoute}`);
  }
  const tags = Array.from(tagSet);
  const metadata: Record<string, unknown> = {
    requestId: ctx.requestId ?? null,
    sessionId: ctx.sessionId ?? null,
    intent: ctx.intent ?? null,
    guardrailRoute: ctx.guardrailRoute ?? null,
    provider: ctx.provider,
    llmModel: ctx.llmModel,
    presetId: ctx.presetId ?? null,
    traceId: ctx.traceId ?? null,
    langfuseTraceId: ctx.langfuseTraceId ?? null,
    stage: ctx.stage ?? null,
    stageDetail: ctx.stageDetail ?? null,
  };

  if (ctx.embeddingSelection) {
    metadata.embeddingSelection = {
      provider: ctx.embeddingSelection.provider,
      model: ctx.embeddingSelection.model,
      embeddingSpaceId: ctx.embeddingSelection.embeddingSpaceId,
    };
  }

  if (ctx.telemetryDecision) {
    metadata.telemetryDecision = ctx.telemetryDecision;
  }

  const runNameBase = ctx.stage ?? "run";
  const runName = makeRunName(runNameBase, ctx.stageDetail);

  return {
    runName,
    tags,
    metadata,
    callbacks: [],
  };
}
