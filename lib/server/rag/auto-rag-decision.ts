/**
 * Auto-RAG decision logic: determines when and how to trigger enhancement passes.
 *
 * "Weak retrieval" is detected after the base pass. If detected, an auto pass
 * (HyDE / query rewrite) is triggered and compared against the base result.
 * The better result wins. Multi-query merges both candidate sets when enabled.
 */

import type {
  ChatGuardrailConfig,
  ContextWindowResult,
} from "@/lib/server/chat-guardrails";
import type { MultiQueryAltType } from "@/lib/server/langchain/multi-query";
import type { RagAutoMode, RagMultiQueryMode } from "@/types/chat-config";

// Thresholds for weak-retrieval detection. Changing these alters Auto-RAG behavior.
const AUTO_SCORE_MARGIN = 0.05;
const AUTO_MIN_INCLUDED = 3;

// Suppression thresholds: skip Auto-RAG when user settings already favor high recall.
export const AUTO_SUPPRESS_TOPK = 18;
export const AUTO_SUPPRESS_SIMILARITY = 0.1;

export type RetrievalPassMetrics = {
  pass: "base" | "auto";
  firedHyde: boolean;
  firedRewrite: boolean;
  highestScore: number | null;
  includedCount: number;
  droppedCount: number;
  insufficient: boolean;
  tookMs: number;
};

export type AutoDecisionMetrics = {
  enabledHydeMode: RagAutoMode;
  enabledRewriteMode: RagAutoMode;
  enabledMultiQueryMode: RagMultiQueryMode;
  autoTriggered: boolean;
  winner: "base" | "auto" | null;
  base: RetrievalPassMetrics;
  auto?: RetrievalPassMetrics;
  multiQuery?: {
    enabled: boolean;
    ran: boolean;
    altType: MultiQueryAltType;
    mergedCandidates: number;
    baseCandidates: number;
    altCandidates: number;
    altQueryHash?: string | null;
    tookMsAlt?: number;
    skippedReason?: MultiQuerySkipReason;
  };
};

export type MultiQuerySkipReason =
  | "not_enabled"
  | "not_weak"
  | "no_alt"
  | "aborted"
  | "timeout"
  | "error";

export type RagDecisionTelemetry = {
  autoTriggered: boolean;
  winner: "base" | "auto" | null;
  altType: MultiQueryAltType;
  multiQueryRan: boolean;
  skippedReason?: MultiQuerySkipReason;
  reason?: "forced" | "auto" | "weak_signal";
};

export function resolveAutoCapability(
  mode: RagAutoMode,
  settingsEnabled: boolean,
): { capabilityEnabled: boolean; autoAllowed: boolean } {
  if (mode === "on") {
    // Legacy "on" from admin config might mean "Force", but applied to session settings it's just "Enabled"
    return { capabilityEnabled: true, autoAllowed: false }; // Reserved for system-forced
  }
  if (mode === "auto") {
    // If settings enabled it, it's available for Auto.
    return { capabilityEnabled: settingsEnabled, autoAllowed: true };
  }
  return { capabilityEnabled: false, autoAllowed: false };
}

export function isWeakRetrieval(
  result: ContextWindowResult,
  similarityThreshold: number,
  finalK: number,
): boolean {
  return (
    result.insufficient ||
    result.highestScore < similarityThreshold + AUTO_SCORE_MARGIN ||
    result.included.length < Math.min(finalK, AUTO_MIN_INCLUDED)
  );
}

export function selectBetterRetrieval(
  baseResult: ContextWindowResult,
  autoResult: ContextWindowResult,
): "base" | "auto" {
  if (autoResult.highestScore !== baseResult.highestScore) {
    return autoResult.highestScore > baseResult.highestScore ? "auto" : "base";
  }
  if (autoResult.included.length !== baseResult.included.length) {
    return autoResult.included.length > baseResult.included.length
      ? "auto"
      : "base";
  }
  if (autoResult.insufficient !== baseResult.insufficient) {
    return autoResult.insufficient ? "base" : "auto";
  }
  return "base";
}

export function evaluateAutoTrigger(args: {
  forcedFlags?: { reverseRag?: boolean; hyde?: boolean };
  reverseRagDecision: { autoAllowed: boolean; capabilityEnabled: boolean };
  hydeDecision: { autoAllowed: boolean; capabilityEnabled: boolean };
  baseWeak: boolean;
  suppressAuto: boolean;
}) {
  const {
    forcedFlags,
    reverseRagDecision,
    hydeDecision,
    baseWeak,
    suppressAuto,
  } = args;

  const shouldAutoRewrite =
    (forcedFlags?.reverseRag ?? false) ||
    (reverseRagDecision.autoAllowed &&
      reverseRagDecision.capabilityEnabled && // Only run if allowed AND enabled
      baseWeak &&
      !suppressAuto);

  const shouldAutoHyde =
    (forcedFlags?.hyde ?? false) ||
    (hydeDecision.autoAllowed &&
      hydeDecision.capabilityEnabled && // Only run if allowed AND enabled
      baseWeak &&
      !suppressAuto);

  return { shouldAutoRewrite, shouldAutoHyde };
}

export class AutoPassTimeoutError extends Error {
  constructor() {
    super("auto-pass-timeout");
  }
}

export function buildPassMetrics(
  pass: "base" | "auto",
  result: ContextWindowResult,
  firedHyde: boolean,
  firedRewrite: boolean,
  tookMs: number,
): RetrievalPassMetrics {
  return {
    pass,
    firedHyde,
    firedRewrite,
    highestScore: Number.isFinite(result.highestScore)
      ? Number(result.highestScore.toFixed(3))
      : null,
    includedCount: result.included.length,
    droppedCount: result.dropped ?? 0,
    insufficient: result.insufficient,
    tookMs,
  };
}

export function buildFailedAutoMetrics(
  firedHyde: boolean,
  firedRewrite: boolean,
  tookMs: number,
): RetrievalPassMetrics {
  return {
    pass: "auto",
    firedHyde,
    firedRewrite,
    highestScore: null,
    includedCount: 0,
    droppedCount: 0,
    insufficient: true,
    tookMs,
  };
}

export function shouldSuppressAuto(guardrails: ChatGuardrailConfig): boolean {
  // Suppress auto when user settings already favor high recall.
  return (
    guardrails.ragTopK >= AUTO_SUPPRESS_TOPK &&
    guardrails.similarityThreshold <= AUTO_SUPPRESS_SIMILARITY
  );
}
