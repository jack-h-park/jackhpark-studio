// Golden telemetry smoke test for the knowledge->standard pipeline.
// Run with `pnpm test:telemetry-golden`, and refresh snapshots via
// `UPDATE_GOLDEN=1 pnpm test:telemetry-golden`.
// Catches regressions for `rag:root`, `context:selection`, and
// `rag_retrieval_stage` telemetry contents without making Langfuse network calls.

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ensureLangfuseClient, langfuse } from "@/lib/langfuse";
import {
  buildRetrievalTelemetryEntries,
  logRetrievalStage,
} from "@/lib/server/chat-common";
import { buildTelemetryConfigSnapshot } from "@/lib/server/telemetry/telemetry-config-snapshot";
import { buildTelemetryMetadata } from "@/lib/server/telemetry/telemetry-metadata";
import {
  drainIngestionBatches,
  resetIngestionBatches,
} from "@/lib/server/telemetry/telemetry-test-sink";
import { buildSpanTiming } from "@/lib/server/telemetry/withSpan";

import { buildGoldenFromIngestion } from "./buildGoldenFromIngestion";
import { normalizeGolden } from "./normalizeGolden";

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "golden.knowledge-standard.json",
);

async function waitForEventLoop() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function captureGoldenTelemetryPayload() {
  await resetIngestionBatches();

  const client = await ensureLangfuseClient();
  if (!client) {
    throw new Error("langfuse client unavailable");
  }

  const requestId = "telemetry-golden-request";
  const trace = langfuse.trace({
    name: "langchain-chat",
    sessionId: "golden-session",
    metadata: {
      requestId,
      intent: "knowledge",
      detailLevel: "standard",
      questionHash: "<question-hash>",
      questionLength: 42,
    },
    input: { intent: "knowledge" },
  });

  if (!trace) {
    throw new Error("langfuse trace was not created");
  }

  const { configSummary, configHash } = buildTelemetryConfigSnapshot({
    presetKey: "golden",
    chatEngine: "langchain",
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
  const llmTiming = buildTiming("answer:llm");
  await trace.observation({
    name: "answer:llm",
    metadata: llmMetadata,
    input: { tokens: 64 },
    output: { finish_reason: "success", citations: 2 },
    startTime: llmTiming.startTime,
    endTime: llmTiming.endTime,
  });

  await waitForEventLoop();

  const payload = buildGoldenFromIngestion(drainIngestionBatches());
  return payload;
}

void describe("golden telemetry payload", () => {
  void it("matches the knowledge intent standard snapshot", async () => {
    process.env.TELEMETRY_TEST_SINK = "1";
    process.env.LANGFUSE_INCLUDE_PII = "false";
    process.env.TELEMETRY_ENABLED = "1";
    process.env.TELEMETRY_SAMPLE_RATE_DEFAULT = "1";
    process.env.TELEMETRY_SAMPLE_RATE_MAX = "1";
    process.env.TELEMETRY_DETAIL_DEFAULT = "standard";
    process.env.TELEMETRY_DETAIL_MAX = "standard";
    process.env.LANGFUSE_BASE_URL = "https://example.com";
    process.env.LANGFUSE_PUBLIC_KEY = "golden-public";
    process.env.LANGFUSE_SECRET_KEY = "golden-secret";

    const originalDateNow = Date.now;
    let fakeTime = 1_700_000_000_000;

    (Date as any).now = () => {
      fakeTime += 1;
      return fakeTime;
    };

    try {
      const payload = await captureGoldenTelemetryPayload();
      const normalized = normalizeGolden(payload);

      if (process.env.UPDATE_GOLDEN === "1") {
        await writeFile(
          FIXTURE_PATH,
          `${JSON.stringify(normalized, null, 2)}\n`,
          "utf8",
        );
        return;
      }

      const expectedText = await readFile(FIXTURE_PATH, "utf8");
      const expected = JSON.parse(expectedText);
      assert.deepStrictEqual(normalized, expected);
    } finally {
      (Date as any).now = originalDateNow;
    }
  });
});
