import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";
import type { PromptTemplate } from "@langchain/core/prompts";
import type { NextApiResponse } from "next";

import type { LangfuseTrace } from "@/lib/langfuse";
import type {
  ContextWindowResult,
  HistoryWindowResult,
  RoutedQuestion,
} from "@/lib/server/chat-guardrails";
import type {
  ResponseCacheMeta,
  TraceUpdate,
} from "@/lib/server/telemetry/trace-metadata-merge";
import type { ModelProvider } from "@/lib/shared/model-provider";
import type { CitationPayload } from "@/lib/types/citation";
import { llmLogger, ragLogger } from "@/lib/logging/logger";
import { memoryCacheClient } from "@/lib/server/chat-cache";
import { CITATIONS_SEPARATOR } from "@/lib/server/chat-common";
import { buildRagAnswerChain } from "@/lib/server/langchain/ragAnswerChain";
import {
  buildChainRunnableConfig,
  type ChainRunContext,
  makeRunName,
} from "@/lib/server/langchain/runnableConfig";
import { renderStreamChunk } from "@/lib/server/langchain/stream-chunk";
import { respondWithOllamaUnavailable } from "@/lib/server/ollama-errors";
import { OllamaUnavailableError } from "@/lib/server/ollama-provider";
import { buildTelemetryMetadata } from "@/lib/server/telemetry/telemetry-metadata";
import { buildSafeTraceOutputSummary } from "@/lib/server/telemetry/telemetry-summaries";
import { withSpan } from "@/lib/server/telemetry/withSpan";
import {
  type GuardrailMeta,
  serializeGuardrailMeta,
} from "@/lib/shared/guardrail-meta";

function formatChunkPreview(value: string) {
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 60) {
    return collapsed;
  }
  return `${collapsed.slice(0, 60)}…`;
}

/**
 * Replace lone UTF-16 surrogates (U+D800–U+DFFF without a valid pair) with
 * the Unicode replacement character (U+FFFD).  JSON.stringify silently
 * produces invalid JSON when a JS string contains a lone surrogate, which
 * causes Anthropic's API to return 400 "no low surrogate in string".
 *
 * Valid surrogate pairs are left untouched.
 */
function sanitizeLoneSurrogates(str: string): string {
  // Match a lone high surrogate (not followed by a low surrogate) OR
  // a lone low surrogate (not preceded by a high surrogate).
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- regex pattern, not a literal string
  return str.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "�",
  );
}

const SMOKE_HEADERS_ENABLED =
  process.env.SMOKE_HEADERS === "1" || process.env.NODE_ENV !== "production";

function setSmokeHeaders(res: NextApiResponse, cacheHit: boolean | null) {
  if (!SMOKE_HEADERS_ENABLED) {
    return;
  }
  res.setHeader("x-cache-hit", cacheHit === true ? "1" : "0");
}

export interface StreamAnswerParams {
  promptInput: {
    llmInstance: BaseLanguageModelInterface;
    prompt: PromptTemplate;
    question: string;
    historyWindow: HistoryWindowResult;
  };
  ragOutput: {
    contextResult: ContextWindowResult;
    citationPayload: CitationPayload;
    latestMeta: GuardrailMeta;
    routingDecision: RoutedQuestion;
  };
  runtime: {
    provider: ModelProvider;
    model: string;
    requestedModelId: string;
    candidateModelId: string;
    responseCacheKey: string | null;
    responseCacheTtl: number;
    abortSignal?: AbortSignal | null;
    chainRunContext: ChainRunContext;
    initialStreamStarted: boolean;
  };
  http: {
    res: NextApiResponse;
    respondJson: (status: number, payload: unknown) => void;
    clearWatchdog: () => void;
  };
  telemetry: {
    cacheMeta: ResponseCacheMeta;
    trace?: LangfuseTrace | null;
    updateTrace?: (updates: TraceUpdate) => void;
    capturePosthogEvent:
      | ((status: "success" | "error", errorType?: string | null) => void)
      | null;
    markStage?: (stage: string, extra?: Record<string, unknown>) => void;
    logReturn: (label: string) => void;
  };
}

export interface StreamAnswerResult {
  finalOutput: string;
  handledEarlyExit?: boolean;
}

export async function streamAnswerWithPrompt({
  promptInput: { llmInstance, prompt, question, historyWindow },
  ragOutput: { contextResult, citationPayload, latestMeta, routingDecision },
  runtime: {
    provider,
    model,
    requestedModelId,
    candidateModelId,
    responseCacheKey,
    responseCacheTtl,
    abortSignal,
    chainRunContext,
    initialStreamStarted,
  },
  http: { res, respondJson, clearWatchdog },
  telemetry: {
    cacheMeta,
    trace,
    updateTrace,
    capturePosthogEvent,
    markStage,
    logReturn,
  },
}: StreamAnswerParams): Promise<StreamAnswerResult> {
  const guardrailMeta = [
    `Intent: ${routingDecision.intent} (${routingDecision.reason})`,
    contextResult.insufficient
      ? "Context status: insufficient matches. Be explicit when information is missing."
      : `Context status: ${contextResult.included.length} excerpts (${contextResult.totalTokens} tokens).`,
  ].join(" | ");
  const contextValue =
    contextResult.contextBlock.length > 0
      ? contextResult.contextBlock
      : "(No relevant context was found.)";

  // Build a formatted transcript of the most recent turns (preserved messages)
  // that are not already part of the summarized summaryMemory.
  const transcriptLines: string[] = [];
  const questionNormalized = question?.trim();

  // Robustly exclude the current question from the history transcript.
  // We identify the last message that matches the current user question to avoid
  // duplicating it in the {memory} section, as it's already in the {question} section.
  let excludeIndex = -1;
  if (questionNormalized) {
    for (let i = historyWindow.preserved.length - 1; i >= 0; i -= 1) {
      const m = historyWindow.preserved[i];
      if (m.role === "user" && m.content?.trim() === questionNormalized) {
        excludeIndex = i;
        break;
      }
    }
  }

  for (let i = 0; i < historyWindow.preserved.length; i++) {
    if (i === excludeIndex) continue;
    const m = historyWindow.preserved[i];
    const roleLabel = m.role === "user" ? "User" : "Assistant";
    transcriptLines.push(`${roleLabel}: ${m.content}`);
  }

  const preservedTranscript = transcriptLines.join("\n");

  // Combine summarized old history and recent transcript with clear section headers.
  const memoryParts: string[] = [];
  const summaryMemory = historyWindow.summaryMemory?.trim();
  if (summaryMemory) {
    memoryParts.push(`Summary of earlier conversation:\n${summaryMemory}`);
  }
  if (preservedTranscript) {
    memoryParts.push(
      `Most recent conversation transcript:\n${preservedTranscript}`,
    );
  }

  const memoryValue =
    memoryParts.length > 0
      ? memoryParts.join("\n\n")
      : "(No prior conversation history. Treat this as a standalone exchange.)";
  const answerChain = buildRagAnswerChain();
  const answerChainRunnableConfig = buildChainRunnableConfig({
    ...chainRunContext,
    stage: "answer",
  });
  const signal = abortSignal ?? undefined;

  let streamHeadersSent = initialStreamStarted;
  let finalOutput = "";
  let chunkIndex = 0;
  const ensureStreamHeaders = () => {
    if (res.headersSent) {
      streamHeadersSent = true;
      return;
    }
    if (!streamHeadersSent) {
      setSmokeHeaders(res, cacheMeta.responseHit);
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      });
      streamHeadersSent = true;
    }
  };

  if (latestMeta) {
    latestMeta.telemetry = {
      cache: {
        responseHit:
          cacheMeta.responseHit === null ? undefined : cacheMeta.responseHit,
        retrievalHit:
          cacheMeta.retrievalHit === null ? undefined : cacheMeta.retrievalHit,
      },
    };
    res.setHeader(
      "X-Guardrail-Meta",
      encodeURIComponent(serializeGuardrailMeta(latestMeta)),
    );
  }
  res.setHeader("Content-Encoding", "identity");

  const emitTraceOutput = (aborted: boolean) => {
    if (!updateTrace) {
      return;
    }
    const citationsCount = citationPayload?.citations?.length ?? 0;
    const canInferInsufficient = routingDecision.intent === "knowledge";
    updateTrace?.({
      output: buildSafeTraceOutputSummary({
        answerChars: finalOutput.length,
        citationsCount,
        cacheHit: cacheMeta.responseHit,
        insufficient: canInferInsufficient ? contextResult.insufficient : null,
        finishReason: aborted ? "aborted" : "success",
      }),
      metadata: {
        aborted,
      },
    });
  };

  const answerMetadata = buildTelemetryMetadata({
    kind: "llm",
    requestId: chainRunContext.requestId ?? null,
    generationProvider: provider,
    generationModel: model,
    additional: {
      responseCacheHit: cacheMeta.responseHit,
    },
  });
  let handledEarlyExit = false;

  try {
    await withSpan(
      {
        trace,
        requestId: chainRunContext.requestId ?? null,
        name: "answer:llm",
        metadata: answerMetadata,
      },
      async () => {
        try {
          markStage?.("before-llm-call");
          markStage?.("answer-chain-invoked");
          const answerResult = await answerChain.invoke(
            {
              question: sanitizeLoneSurrogates(question),
              guardrailMeta,
              contextValue: sanitizeLoneSurrogates(contextValue),
              memoryValue: sanitizeLoneSurrogates(memoryValue),
              prompt,
              llmInstance,
            },
            {
              ...answerChainRunnableConfig,
              runName: makeRunName("answer", "root"),
              signal,
            },
          );
          const { promptInput, stream } = answerResult;
          markStage?.("stream-loop-started");

          if (candidateModelId !== requestedModelId) {
            llmLogger.info(
              `[langchain_chat] Gemini model "${candidateModelId}" succeeded after falling back from "${requestedModelId}".`,
            );
          }

          ragLogger.trace("[langchain_chat] debug context", {
            length: contextValue.length,
            preview: contextValue.slice(0, 100).replaceAll("\n", "\\n"),
            insufficient: contextResult.insufficient,
          });
          ragLogger.trace(
            "[langchain_chat] prompt input preview",
            promptInput.slice(0, 500).replaceAll("\n", "\\n"),
          );

          for await (const chunk of stream) {
            if (abortSignal?.aborted) {
              break;
            }
            const rendered = renderStreamChunk(chunk);
            if (!rendered || res.writableEnded) {
              continue;
            }
            chunkIndex += 1;
            llmLogger.trace("[langchain_chat] stream chunk", {
              chunkIndex,
              length: rendered.length,
              preview: formatChunkPreview(rendered),
            });
            if (chunkIndex === 1) {
              markStage?.("first-chunk-sent", {
                chunkIndex,
                chunkLength: rendered.length,
              });
              markStage?.("after-llm-first-byte", {
                chunkIndex,
                chunkLength: rendered.length,
              });
            }
            if (abortSignal?.aborted) {
              break;
            }
            ensureStreamHeaders();
            finalOutput += rendered;
            res.write(rendered);
          }

          if (abortSignal?.aborted) {
            answerMetadata.aborted = true;
            answerMetadata.finishReason = "aborted";
            emitTraceOutput(true);
            handledEarlyExit = true;
            return;
          }

          ensureStreamHeaders();
          llmLogger.trace("[langchain_chat] stream completed", {
            chunkCount: chunkIndex,
          });
          answerMetadata.aborted = false;
          answerMetadata.finishReason = "success";
          emitTraceOutput(false);
        } catch (spanErr) {
          answerMetadata.aborted = true;
          answerMetadata.finishReason = "error";
          throw spanErr;
        }
      },
    );

    if (handledEarlyExit) {
      return { finalOutput, handledEarlyExit: true };
    }

    const citationJson = JSON.stringify(citationPayload);
    if (!abortSignal?.aborted && responseCacheKey) {
      await memoryCacheClient.set(
        responseCacheKey,
        { output: finalOutput, citations: citationJson },
        responseCacheTtl,
      );
      cacheMeta.responseHit = false;
    }
    if (!res.writableEnded) {
      res.write(`${CITATIONS_SEPARATOR}${citationJson}`);
    }
    // Trace updates moved to telemetry buffer flush.
    res.end();
    markStage?.("response-end");
    markStage?.("stream-completed");
    return { finalOutput };
  } catch (streamErr) {
    if (abortSignal?.aborted) {
      emitTraceOutput(true);
      return { finalOutput, handledEarlyExit: true };
    }
    if (!res.headersSent) {
      const errMessage = streamErr instanceof Error ? streamErr.message : "";
      if (streamErr instanceof OllamaUnavailableError) {
        capturePosthogEvent?.("error", "local_llm_unavailable");
        markStage?.("stream-ollama-unavailable");
        clearWatchdog();
        respondWithOllamaUnavailable(res);
        logReturn("stream-ollama-unavailable");
        return { finalOutput: "", handledEarlyExit: true };
      }
      if (
        errMessage.includes("No models loaded") ||
        errMessage.includes("connection refused")
      ) {
        capturePosthogEvent?.("error", "local_llm_unavailable");
        markStage?.("stream-local-llm-unavailable");
        respondJson(503, {
          error: {
            code: "LOCAL_LLM_UNAVAILABLE",
            message:
              "No model loaded in LM Studio. Please load a model in the LM Studio app.",
          },
        });
        updateTrace?.({
          output: buildSafeTraceOutputSummary({
            answerChars: 0,
            citationsCount: 0,
            cacheHit: cacheMeta.responseHit,
            insufficient: null,
            finishReason: "error",
            errorCategory: "local_llm_unavailable",
          }),
          metadata: {
            aborted: false,
            error_category: "local_llm_unavailable",
          },
        });
        logReturn("stream-local-llm-unavailable");
        return { finalOutput: "", handledEarlyExit: true };
      }
    }
    throw streamErr;
  }
}
