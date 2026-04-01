/**
 * Trace metadata merge utilities for Langfuse trace updates.
 *
 * Merge semantics are domain-specific and must not be changed casually.
 * See: docs/telemetry/operations/telemetry-operational-verification-local.md
 *
 * Invariants:
 * - cache/rag boolean flags are monotonic: once true, never revert to false.
 * - intent is first-write-wins; later changes are recorded as intent_final.
 * - aborted is terminal: once true, never flips back to false.
 * - numeric counters take the max value for stable dashboards.
 */

import type { SafeTraceInputSummary, SafeTraceOutputSummary } from "@/lib/server/telemetry/telemetry-summaries";

export type TraceMetadataSnapshot = {
  [key: string]: unknown;
  cache?: {
    responseHit: boolean | null;
    retrievalHit: boolean | null;
  };
  // Typed as unknown here to avoid importing Auto-RAG decision types.
  // Callers that set this field cast to the concrete AutoDecisionMetrics type.
  retrievalAutoDecision?: unknown;
};

export type ResponseCacheMeta = {
  responseHit: boolean | null;
  retrievalHit: boolean | null;
};

export type TraceUpdate = {
  metadata?: Record<string, unknown>;
  input?: SafeTraceInputSummary;
  output?: SafeTraceOutputSummary;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const mergeBooleanMonotonic = (
  prev: boolean | null | undefined,
  next: boolean | null | undefined,
): boolean | null => {
  if (prev === true || next === true) {
    return true;
  }
  if (prev === false || next === false) {
    return false;
  }
  return null;
};

const mergeNumeric = (
  prev: number | null | undefined,
  next: number | null | undefined,
): number | null => {
  if (typeof prev === "number" && typeof next === "number") {
    return Math.max(prev, next);
  }
  if (typeof next === "number") {
    return next;
  }
  if (typeof prev === "number") {
    return prev;
  }
  return null;
};

export const mergeTraceMetadata = (
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> => {
  // ─────────────────────────────────────────────────────────────
  // Telemetry semantic invariant (do not change casually)
  // See: docs/telemetry/operations/telemetry-operational-verification-local.md
  // Invariant: metadata merges keep cache/rag flags monotonic and intent first-write-wins.
  // ─────────────────────────────────────────────────────────────
  const merged = { ...prev };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      continue;
    }
    if (key === "cache" && isPlainObject(value)) {
      // Cache hit flags are monotonic: once true, never revert to false.
      const prior = isPlainObject(merged.cache) ? merged.cache : {};
      merged.cache = {
        ...prior,
        responseHit: mergeBooleanMonotonic(
          prior.responseHit as boolean | null | undefined,
          value.responseHit as boolean | null | undefined,
        ),
        retrievalHit: mergeBooleanMonotonic(
          prior.retrievalHit as boolean | null | undefined,
          value.retrievalHit as boolean | null | undefined,
        ),
      };
      continue;
    }
    if (key === "rag" && isPlainObject(value)) {
      // Retrieval flags are monotonic so cache-hit inference stays stable.
      const prior = isPlainObject(merged.rag) ? merged.rag : {};
      const base = mergeTraceMetadata(prior, value);
      merged.rag = {
        ...base,
        retrieval_attempted: mergeBooleanMonotonic(
          prior.retrieval_attempted as boolean | null | undefined,
          value.retrieval_attempted as boolean | null | undefined,
        ),
        retrieval_used: mergeBooleanMonotonic(
          prior.retrieval_used as boolean | null | undefined,
          value.retrieval_used as boolean | null | undefined,
        ),
      };
      continue;
    }
    if (key === "intent" && typeof value === "string") {
      // Intent is first-write-wins; record any later changes as *_final.
      const prevIntent = merged.intent;
      if (typeof prevIntent === "string" && prevIntent !== value) {
        merged.intent_prev = merged.intent_prev ?? prevIntent;
        merged.intent_final = value;
        continue;
      }
      merged.intent = value;
      continue;
    }
    if (key === "aborted" && typeof value === "boolean") {
      // Aborts are terminal: once true, never flip back to false.
      merged.aborted = mergeBooleanMonotonic(
        merged.aborted as boolean | null | undefined,
        value,
      );
      continue;
    }
    if (typeof value === "number") {
      // Numeric counters move monotonically for stable dashboards.
      merged[key] = mergeNumeric(
        merged[key] as number | null | undefined,
        value,
      );
      continue;
    }
    if (isPlainObject(value)) {
      const prior = isPlainObject(merged[key])
        ? (merged[key] as Record<string, unknown>)
        : {};
      merged[key] = mergeTraceMetadata(prior, value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
};

export const applyTraceMetadataMerge = (
  target: TraceMetadataSnapshot | null | undefined,
  updates: Record<string, unknown>,
): void => {
  if (!target) {
    return;
  }
  const merged = mergeTraceMetadata(target, updates);
  Object.assign(target, merged);
};
