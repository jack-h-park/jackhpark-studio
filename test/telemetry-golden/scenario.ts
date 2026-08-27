/**
 * The one knowledge->standard telemetry scenario, shared by both golden tests.
 *
 * Extracted so the legacy ingestion backend and the OTel backend are driven by
 * an identical sequence of trace/observation calls. If the scenario lived in
 * one test and were copied into the other, the two goldens could drift apart
 * and stop being comparable — which is the whole point of running both while
 * LANGFUSE_OTEL_TRACING is being rolled out.
 */
import type { LangfuseTrace, LangfuseTraceOptions } from "@/lib/langfuse";
import {
  buildRetrievalTelemetryEntries,
  logRetrievalStage,
} from "@/lib/server/chat-common";
import { buildTelemetryConfigSnapshot } from "@/lib/server/telemetry/telemetry-config-snapshot";
import { buildTelemetryMetadata } from "@/lib/server/telemetry/telemetry-metadata";
import { buildSpanTiming } from "@/lib/server/telemetry/withSpan";

export const GOLDEN_REQUEST_ID = "telemetry-golden-request";

export const GOLDEN_TRACE_OPTIONS: LangfuseTraceOptions = {
  name: "langchain-chat",
  sessionId: "golden-session",
  metadata: {
    requestId: GOLDEN_REQUEST_ID,
    intent: "knowledge",
    detailLevel: "standard",
    questionHash: "<question-hash>",
    questionLength: 42,
  },
  input: { intent: "knowledge" },
};

export async function runGoldenScenario(trace: LangfuseTrace): Promise<void> {
  const requestId = GOLDEN_REQUEST_ID;

  const { configSummary, configHash } = buildTelemetryConfigSnapshot({
    presetKey: "golden",
    safeMode: false,
    llmModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-ada-002",
    rag: {
      enabled: true,
      topK: 4,
      similarity: 0.75,
      ranker: "mmr",
      reverseRAG: false,
      hyde: false,
      numericLimits: { ragTopK: 4, similarityThreshold: 0.75 },
      summaryLevel: "standard",
      ranking: {
        docTypeWeights: {},
        personaTypeWeights: {},
      },
    },
    context: {
      tokenBudget: 600,
      historyBudget: 2048,
      clipTokens: 512,
    },
    telemetry: {
      detailLevel: "standard",
      sampleRate: 1,
    },
    cache: {
      responseEnabled: true,
      retrievalEnabled: true,
      responseTtlSeconds: 60,
      retrievalTtlSeconds: 30,
    },
    prompt: {
      baseVersion: "v1",
    },
    guardrails: {
      route: "normal",
    },
  });

  const entries = buildRetrievalTelemetryEntries(
    [
      {
        doc_id: "golden-doc-1",
        similarity: 0.9123,
        metadata_weight: 0.33,
        metadata: {
          doc_type: "article",
          persona_type: "assistant",
          is_public: true,
        },
      },
      {
        doc_id: "golden-doc-2",
        similarity: 0.8012,
        metadata_weight: 0.22,
        metadata: {
          doc_type: "note",
          persona_type: "user",
          is_public: false,
        },
      },
    ],
    8,
  );

  logRetrievalStage(trace, "raw_results", entries, {
    engine: "langchain",
    presetKey: configSummary.presetKey,
    requestId,
    configSummary,
    configHash,
  });
  logRetrievalStage(trace, "after_weighting", entries, {
    engine: "langchain",
    presetKey: configSummary.presetKey,
    requestId,
    configSummary,
    configHash,
  });

  const buildTiming = (spanName: string) =>
    buildSpanTiming({
      name: spanName,
      startMs: Date.now(),
      endMs: Date.now(),
      requestId,
    });

  const selectionMetadata = buildTelemetryMetadata({
    kind: "selection",
    requestId,
    additional: {
      selectionUnit: "chunk",
      inputCount: 3,
      uniqueBeforeDedupe: 3,
      uniqueAfterDedupe: 2,
      droppedByDedupe: 1,
      finalSelectedCount: 2,
      docSelection: {
        inputCount: 3,
        uniqueBeforeDedupe: 3,
        uniqueAfterDedupe: 2,
        droppedByDedupe: 1,
      },
      quotaStart: 0,
      quotaEnd: 4,
      quotaEndUsed: 2,
      droppedByQuota: 0,
      uniqueDocs: 2,
      mmrLite: 0.18,
      mmrLambda: 0.47,
    },
  });
  const selectionTiming = buildTiming("context:selection");
  await trace.observation({
    name: "context:selection",
    metadata: selectionMetadata,
    startTime: selectionTiming.startTime,
    endTime: selectionTiming.endTime,
  });

  const ragRootMetadata = buildTelemetryMetadata({
    kind: "rag_root",
    requestId,
    additional: {
      retrieved: 2,
      ranked: 2,
      included: 2,
      dropped: 1,
      totalTokens: 512,
      highestScore: 0.9123,
      insufficient: false,
      rankerMode: "mmr",
      similarityThreshold: 0.75,
      stage: "final",
    },
  });
  const ragRootTiming = buildTiming("rag:root");
  await trace.observation({
    name: "rag:root",
    metadata: ragRootMetadata,
    startTime: ragRootTiming.startTime,
    endTime: ragRootTiming.endTime,
  });

  const llmMetadata = buildTelemetryMetadata({
    kind: "llm",
    requestId,
    generationProvider: "openai",
    generationModel: "gpt-4o-mini",
    additional: {
      finishReason: "success",
      citationsCount: 2,
    },
  });
  const llmTiming = buildTiming("answer:summary");
  await trace.observation({
    name: "answer:summary",
    metadata: llmMetadata,
    input: { tokens: 64 },
    output: { finish_reason: "success", citations: 2 },
    startTime: llmTiming.startTime,
    endTime: llmTiming.endTime,
  });
}
