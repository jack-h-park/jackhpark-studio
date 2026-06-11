import type { NextApiResponse } from "next";

import type { ChatGuardrailConfig } from "@/lib/server/chat-guardrails";
import type {
  ResponseCacheMeta,
  TraceUpdate,
} from "@/lib/server/telemetry/trace-metadata-merge";
import { ragLogger } from "@/lib/logging/logger";
import {
  buildResponseCacheKeyPayload,
  type RagDecisionSignature,
} from "@/lib/server/api/chat-cache-keys";
import { setSmokeHeaders } from "@/lib/server/api/chat-http-runtime";
import { type ChatTraceState } from "@/lib/server/api/chat-trace-state";
import { hashPayload, memoryCacheClient } from "@/lib/server/chat-cache";
import { CITATIONS_SEPARATOR } from "@/lib/server/chat-common";
import { buildSafeTraceOutputSummary } from "@/lib/server/telemetry/telemetry-summaries";

export type ResponseCacheSnapshot = {
  output: string;
  citations?: string;
};

type ResponseCacheKeyPayloadInput = Parameters<
  typeof buildResponseCacheKeyPayload
>[0];

type ResponseCacheKeyInput = Omit<
  ResponseCacheKeyPayloadInput,
  "decision" | "guardrails"
> & {
  guardrails: ChatGuardrailConfig;
};

export type ResponseCacheCoordinatorDeps = {
  res: NextApiResponse;
  responseCacheTtl: number;
  /** Auto/multi-query modes defer key computation until the RAG decision is known. */
  autoOrMultiEnabled: boolean;
  keyInput: ResponseCacheKeyInput;
  includeVerboseDetails: boolean;
  traceState: ChatTraceState;
  cacheMeta: ResponseCacheMeta;
  mark: (stage: string, extra?: Record<string, unknown>) => void;
  clearWatchdog: () => void;
  logReturn: (label: string) => void;
  updateTrace: (updates: TraceUpdate) => void;
  updateTraceCacheMetadata: () => void;
  pushTelemetryEvent: (name: string, detail?: Record<string, unknown>) => void;
  capturePosthog: (status: "success" | "error", errorType?: string | null) => void;
};

export type ResponseCacheCoordinator = {
  strategy: "early" | "late";
  /** Last key built; used for write-back after streaming. */
  getKey: () => string | null;
  /**
   * Build the key for the given decision, look it up, and serve the cached
   * response when present. Returns true when the request was fully served.
   */
  tryServeFromCache: (
    decision: RagDecisionSignature | null,
  ) => Promise<boolean>;
};

/**
 * Single owner of the chat response cache: key derivation, the early/late
 * lookup (late when auto/multi-query makes the key decision-dependent), and
 * serving cache hits with the associated trace/analytics bookkeeping.
 */
export function createResponseCacheCoordinator(
  deps: ResponseCacheCoordinatorDeps,
): ResponseCacheCoordinator {
  const strategy: "early" | "late" = deps.autoOrMultiEnabled
    ? "late"
    : "early";
  let responseCacheKey: string | null = null;

  const buildKey = (decision: RagDecisionSignature | null): string | null => {
    if (deps.responseCacheTtl <= 0) {
      return null;
    }
    const { guardrails, ...keyInput } = deps.keyInput;
    return `chat:response:${keyInput.presetId}:${hashPayload(
      buildResponseCacheKeyPayload({
        ...keyInput,
        guardrails: {
          ragTopK: guardrails.ragTopK,
          similarityThreshold: guardrails.similarityThreshold,
          ragContextTokenBudget: guardrails.ragContextTokenBudget,
          ragContextClipTokens: guardrails.ragContextClipTokens,
        },
        decision,
      }),
    )}`;
  };

  const serveHit = (cacheKey: string, snapshot: ResponseCacheSnapshot) => {
    const { res, traceState, cacheMeta } = deps;
    deps.mark("cache-response-hit");
    cacheMeta.responseHit = true;
    deps.updateTraceCacheMetadata();
    deps.pushTelemetryEvent("cache-hit", {
      responseCacheKey: cacheKey,
      outputLength: snapshot.output.length,
    });
    if (traceState.retrievalAttempted === null) {
      traceState.retrievalAttempted = false;
      traceState.retrievalUsed = false;
      traceState.retrievalLatencyMs = null;
    }
    const citationsCount = (() => {
      if (!snapshot.citations) {
        return 0;
      }
      try {
        const parsed = JSON.parse(snapshot.citations) as {
          citations?: unknown;
        };
        return Array.isArray(parsed?.citations) ? parsed.citations.length : 0;
      } catch {
        return 0;
      }
    })();
    setSmokeHeaders(res, true);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    const body =
      snapshot.citations !== undefined
        ? `${snapshot.output}${CITATIONS_SEPARATOR}${snapshot.citations}`
        : snapshot.output;
    deps.clearWatchdog();
    res.end(body);
    // ─────────────────────────────────────────────────────────────
    // Telemetry semantic invariant (do not change casually)
    // See: docs/telemetry/operations/telemetry-operational-verification-local.md
    // Invariant: cache-hit "insufficient" only inferred when retrieval was attempted and no citations.
    // ─────────────────────────────────────────────────────────────
    const retrievalAttemptedForTrace = Boolean(
      (traceState.metadata as { rag?: { retrieval_attempted?: boolean } })?.rag
        ?.retrieval_attempted ||
      (traceState.metadata as { rag?: { retrieval_used?: boolean } })?.rag
        ?.retrieval_used,
    );
    traceState.finalizeReason = "success";
    deps.updateTrace({
      metadata: {
        responseCacheStrategy: strategy,
        responseCacheHit: true,
        aborted: false,
      },
      output: buildSafeTraceOutputSummary({
        answerChars: snapshot.output.length,
        citationsCount,
        cacheHit: true,
        insufficient:
          retrievalAttemptedForTrace && citationsCount === 0 ? true : null,
        finishReason: "success",
      }),
    });
    deps.capturePosthog("success", null);
    deps.logReturn("response-cache-hit");
  };

  const tryServeFromCache = async (
    decision: RagDecisionSignature | null,
  ): Promise<boolean> => {
    responseCacheKey = buildKey(decision);
    deps.mark("cache-lookup-start");
    let cachedSnapshot: ResponseCacheSnapshot | null = null;
    if (responseCacheKey) {
      cachedSnapshot = await memoryCacheClient.get(responseCacheKey);
    }
    deps.mark("cache-lookup-done");
    deps.mark("cache-lookup", {
      responseCacheKey,
      cacheHit: Boolean(cachedSnapshot),
    });
    if (strategy === "late" && deps.includeVerboseDetails) {
      ragLogger.debug("[langchain_chat] response cache strategy", {
        responseCacheStrategy: strategy,
        decision: decision
          ? {
              autoTriggered: decision.autoTriggered,
              winner: decision.winner,
              altType: decision.altType,
              multiQueryRan: decision.multiQueryRan,
            }
          : null,
        altQueryHashPresent: Boolean(decision?.altQueryHash),
      });
    }
    if (cachedSnapshot && responseCacheKey) {
      serveHit(responseCacheKey, cachedSnapshot);
      return true;
    }
    deps.mark("cache-miss");
    deps.updateTrace({
      metadata: {
        responseCacheStrategy: strategy,
        responseCacheHit: false,
      },
    });
    deps.cacheMeta.responseHit = false;
    deps.updateTraceCacheMetadata();
    return false;
  };

  return {
    strategy,
    getKey: () => responseCacheKey,
    tryServeFromCache,
  };
}
