import type { SessionChatConfig } from "@/types/chat-config";
import { loadGuardrailSettings } from "@/lib/server/chat-settings";
import {
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_MODE,
  parseBooleanFlag,
  parseRankerMode,
  parseReverseRagMode,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";

import type { ChatGuardrailConfig, SanitizationChange } from "./types";

const SANITIZE_RAG_TOP_K_MIN = 1;
const SANITIZE_RAG_TOP_K_MAX = 20;
const SANITIZE_SIMILARITY_MIN = 0.05;
const SANITIZE_SIMILARITY_MAX = 0.9;
const SANITIZE_CONTEXT_BUDGET_MIN = 256;
const SANITIZE_CONTEXT_BUDGET_MAX = 8192;
const SANITIZE_HISTORY_BUDGET_MIN = 0;
const SANITIZE_HISTORY_BUDGET_MAX = 8192;
const SANITIZE_CLIP_TOKENS_MIN = 0;
const SANITIZE_CLIP_TOKENS_MAX = 1024;
const SANITIZE_SUMMARY_TRIGGER_MIN = 200;
const SANITIZE_SUMMARY_TRIGGER_MAX = 8192;
const SANITIZE_SUMMARY_MAX_TURNS_MIN = 1;
const SANITIZE_SUMMARY_MAX_TURNS_MAX = 50;
const SANITIZE_SUMMARY_MAX_CHARS_MIN = 200;
const SANITIZE_SUMMARY_MAX_CHARS_MAX = 4000;
const SAFE_MODE_CONTEXT_TOKEN_BUDGET = 600;
const SAFE_MODE_HISTORY_TOKEN_BUDGET = 300;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function getChatGuardrailConfig(options?: {
  forceRefresh?: boolean;
  sessionConfig?: SessionChatConfig;
}): Promise<ChatGuardrailConfig> {
  const guardrailSettings = await loadGuardrailSettings({
    forceRefresh: options?.forceRefresh,
  });
  const numeric = guardrailSettings.numeric;
  const session = options?.sessionConfig;

  // Use session overrides if available, otherwise fall back to admin settings
  const similarityThreshold =
    typeof session?.rag?.similarity === "number"
      ? session.rag.similarity
      : numeric.similarityThreshold;

  const ragTopK =
    typeof session?.rag?.topK === "number" ? session.rag.topK : numeric.ragTopK;

  const ragContextTokenBudget =
    typeof session?.context?.tokenBudget === "number"
      ? session.context.tokenBudget
      : numeric.ragContextTokenBudget;

  const ragContextClipTokens =
    typeof session?.context?.clipTokens === "number"
      ? session.context.clipTokens
      : numeric.ragContextClipTokens;

  const historyTokenBudget =
    typeof session?.context?.historyBudget === "number"
      ? session.context.historyBudget
      : numeric.historyTokenBudget;

  const safeModeEnabled = Boolean(session?.safeMode);
  const effectiveRagContextTokenBudget = safeModeEnabled
    ? Math.min(ragContextTokenBudget, SAFE_MODE_CONTEXT_TOKEN_BUDGET)
    : ragContextTokenBudget;
  const effectiveHistoryTokenBudget = safeModeEnabled
    ? Math.min(historyTokenBudget, SAFE_MODE_HISTORY_TOKEN_BUDGET)
    : historyTokenBudget;

  const summaryEnabled =
    session?.summaryLevel && session.summaryLevel !== "off"
      ? true
      : numeric.summaryEnabled;

  return {
    similarityThreshold: clamp(similarityThreshold, 0, 1),
    ragTopK: Math.max(1, ragTopK),
    ragContextTokenBudget: Math.max(200, effectiveRagContextTokenBudget),
    ragContextClipTokens: Math.max(64, ragContextClipTokens),
    historyTokenBudget: Math.max(200, effectiveHistoryTokenBudget),
    summary: {
      enabled: summaryEnabled,
      triggerTokens: Math.max(200, numeric.summaryTriggerTokens),
      maxChars: Math.max(200, numeric.summaryMaxChars),
      maxTurns: Math.max(2, numeric.summaryMaxTurns),
    },
    chitchatKeywords: guardrailSettings.chitchatKeywords,
    fallbacks: {
      chitchat: guardrailSettings.fallbackChitchat,
      command: guardrailSettings.fallbackCommand,
    },
  };
}

export function sanitizeChatSettings(input: {
  guardrails: ChatGuardrailConfig;
  runtimeFlags: {
    reverseRagEnabled: boolean;
    reverseRagMode: ReverseRagMode;
    hydeEnabled: boolean;
    rankerMode: RankerMode;
  };
}): {
  guardrails: ChatGuardrailConfig;
  runtimeFlags: {
    reverseRagEnabled: boolean;
    reverseRagMode: ReverseRagMode;
    hydeEnabled: boolean;
    rankerMode: RankerMode;
  };
  changes: SanitizationChange[];
} {
  const changes: SanitizationChange[] = [];

  const pushChange = (
    key: string,
    from: unknown,
    to: unknown,
    reason: string,
  ) => {
    if (!Object.is(from, to)) {
      changes.push({ key, from, to, reason });
    }
  };

  const sanitizeNumber = (
    key: string,
    value: unknown,
    options: { min: number; max: number; fallback: number; integer?: boolean },
  ) => {
    let next = options.fallback;
    let reason = "invalid-type";

    if (typeof value === "number" && Number.isFinite(value)) {
      next = value;
      reason = "out-of-range";
    }

    if (options.integer) {
      const rounded = Math.round(next);
      if (!Object.is(rounded, next)) {
        next = rounded;
        reason = reason === "invalid-type" ? reason : "rounded";
      }
    }

    const clamped = clamp(next, options.min, options.max);
    if (!Object.is(clamped, next)) {
      next = clamped;
      reason = "out-of-range";
    }

    pushChange(key, value, next, reason);
    return next;
  };

  const sanitizeBoolean = (key: string, value: unknown, fallback: boolean) => {
    const next = parseBooleanFlag(value, fallback);
    pushChange(key, value, next, "invalid-type");
    return next;
  };

  const sanitizedGuardrails: ChatGuardrailConfig = {
    ...input.guardrails,
    similarityThreshold: sanitizeNumber(
      "guardrails.similarityThreshold",
      input.guardrails.similarityThreshold,
      {
        min: SANITIZE_SIMILARITY_MIN,
        max: SANITIZE_SIMILARITY_MAX,
        fallback: SANITIZE_SIMILARITY_MIN,
      },
    ),
    ragTopK: sanitizeNumber("guardrails.ragTopK", input.guardrails.ragTopK, {
      min: SANITIZE_RAG_TOP_K_MIN,
      max: SANITIZE_RAG_TOP_K_MAX,
      fallback: SANITIZE_RAG_TOP_K_MIN,
      integer: true,
    }),
    ragContextTokenBudget: sanitizeNumber(
      "guardrails.ragContextTokenBudget",
      input.guardrails.ragContextTokenBudget,
      {
        min: SANITIZE_CONTEXT_BUDGET_MIN,
        max: SANITIZE_CONTEXT_BUDGET_MAX,
        fallback: SANITIZE_CONTEXT_BUDGET_MIN,
        integer: true,
      },
    ),
    ragContextClipTokens: sanitizeNumber(
      "guardrails.ragContextClipTokens",
      input.guardrails.ragContextClipTokens,
      {
        min: SANITIZE_CLIP_TOKENS_MIN,
        max: SANITIZE_CLIP_TOKENS_MAX,
        fallback: SANITIZE_CLIP_TOKENS_MIN,
        integer: true,
      },
    ),
    historyTokenBudget: sanitizeNumber(
      "guardrails.historyTokenBudget",
      input.guardrails.historyTokenBudget,
      {
        min: SANITIZE_HISTORY_BUDGET_MIN,
        max: SANITIZE_HISTORY_BUDGET_MAX,
        fallback: SANITIZE_HISTORY_BUDGET_MIN,
        integer: true,
      },
    ),
    summary: {
      ...input.guardrails.summary,
      enabled: sanitizeBoolean(
        "guardrails.summary.enabled",
        input.guardrails.summary.enabled,
        Boolean(input.guardrails.summary.enabled),
      ),
      triggerTokens: sanitizeNumber(
        "guardrails.summary.triggerTokens",
        input.guardrails.summary.triggerTokens,
        {
          min: SANITIZE_SUMMARY_TRIGGER_MIN,
          max: SANITIZE_SUMMARY_TRIGGER_MAX,
          fallback: SANITIZE_SUMMARY_TRIGGER_MIN,
          integer: true,
        },
      ),
      maxChars: sanitizeNumber(
        "guardrails.summary.maxChars",
        input.guardrails.summary.maxChars,
        {
          min: SANITIZE_SUMMARY_MAX_CHARS_MIN,
          max: SANITIZE_SUMMARY_MAX_CHARS_MAX,
          fallback: SANITIZE_SUMMARY_MAX_CHARS_MIN,
          integer: true,
        },
      ),
      maxTurns: sanitizeNumber(
        "guardrails.summary.maxTurns",
        input.guardrails.summary.maxTurns,
        {
          min: SANITIZE_SUMMARY_MAX_TURNS_MIN,
          max: SANITIZE_SUMMARY_MAX_TURNS_MAX,
          fallback: SANITIZE_SUMMARY_MAX_TURNS_MIN,
          integer: true,
        },
      ),
    },
  };

  const runtimeReverseRagMode = parseReverseRagMode(
    input.runtimeFlags.reverseRagMode,
    DEFAULT_REVERSE_RAG_MODE,
  );
  pushChange(
    "runtimeFlags.reverseRagMode",
    input.runtimeFlags.reverseRagMode,
    runtimeReverseRagMode,
    "invalid-enum",
  );

  const runtimeRankerMode = parseRankerMode(
    input.runtimeFlags.rankerMode,
    DEFAULT_RANKER_MODE,
  );
  pushChange(
    "runtimeFlags.rankerMode",
    input.runtimeFlags.rankerMode,
    runtimeRankerMode,
    "invalid-enum",
  );

  const sanitizedRuntimeFlags = {
    reverseRagEnabled: sanitizeBoolean(
      "runtimeFlags.reverseRagEnabled",
      input.runtimeFlags.reverseRagEnabled,
      Boolean(input.runtimeFlags.reverseRagEnabled),
    ),
    reverseRagMode: runtimeReverseRagMode,
    hydeEnabled: sanitizeBoolean(
      "runtimeFlags.hydeEnabled",
      input.runtimeFlags.hydeEnabled,
      Boolean(input.runtimeFlags.hydeEnabled),
    ),
    rankerMode: runtimeRankerMode,
  };

  return {
    guardrails: sanitizedGuardrails,
    runtimeFlags: sanitizedRuntimeFlags,
    changes,
  };
}
