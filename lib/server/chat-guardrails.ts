import { decode, encode } from "gpt-tokenizer";

import { host } from "@/lib/config";
import { ragLogger } from "@/lib/logging/logger";
import { loadGuardrailSettings } from "@/lib/server/chat-settings";
import { normalizePageId } from "@/lib/server/page-url";
import {
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_MODE,
  parseBooleanFlag,
  parseRankerMode,
  parseReverseRagMode,
  type RankerMode,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";
import { type SessionChatConfig } from "@/types/chat-config";

export type GuardrailChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatIntent = "knowledge" | "chitchat" | "command";

export type NormalizedQuestion = {
  raw: string;
  normalized: string;
  canonical: string;
  language: "en" | "ko" | "mixed" | "unknown";
};

export type RoutedQuestion = {
  question: NormalizedQuestion;
  intent: ChatIntent;
  confidence: number;
  reason: string;
};

export type ChatGuardrailConfig = {
  similarityThreshold: number;
  ragTopK: number;
  ragContextTokenBudget: number;
  ragContextClipTokens: number;
  historyTokenBudget: number;
  summary: {
    enabled: boolean;
    triggerTokens: number;
    maxChars: number;
    maxTurns: number;
  };
  chitchatKeywords: string[];
  fallbacks: {
    chitchat: string;
    command: string;
  };
};

export type RagDocument = {
  chunk?: string | null;
  similarity?: number | null;
  score?: number | null;
  metadata?: Record<string, any> | null;
  [key: string]: any;
};

export type SelectionUnit = "chunk" | "doc";

export type SelectionDedupMetrics = {
  selectionUnit: SelectionUnit;
  inputCount: number;
  uniqueBeforeDedupe: number;
  uniqueAfterDedupe: number;
  droppedByDedupe: number;
  dedupedDocs: RagDocument[];
};

export type ContextSelectionMetrics = {
  quotaStart: number;
  quotaEnd: number;
  quotaEndUsed: number;
  droppedByDedupe: number;
  droppedByQuota: number;
  uniqueDocs: number;
  mmrLite: boolean;
  mmrLambda: number;
  selectionUnit: SelectionUnit;
  inputCount: number;
  uniqueBeforeDedupe: number;
  uniqueAfterDedupe: number;
  finalSelectedCount: number;
  docSelection: {
    inputCount: number;
    uniqueBeforeDedupe: number;
    uniqueAfterDedupe: number;
    droppedByDedupe: number;
  };
};

export type ContextWindowResult = {
  contextBlock: string;
  included: Array<
    RagDocument & {
      prunedChunk: string;
      clipped: boolean;
      tokenCount: number;
    }
  >;
  dropped: number;
  totalTokens: number;
  insufficient: boolean;
  highestScore: number;
  selection?: ContextSelectionMetrics;
};

export type SanitizationChange = {
  key: string;
  from: unknown;
  to: unknown;
  reason: string;
};

export type HistoryWindowResult = {
  preserved: GuardrailChatMessage[];
  trimmed: GuardrailChatMessage[];
  tokenCount: number;
  summaryMemory: string | null;
};

const DEFAULT_MAX_CHUNKS_PER_DOC = 2;
const MAX_RELAXED_CHUNKS_PER_DOC = 6;
const DEDUP_NORMALIZE_MODE = "simple";
const DEDUP_MIN_CHARS = 80;
const DEDUP_FINGERPRINT_CHARS = 40;
const MMR_LITE_LAMBDA = 0.15;

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

const normalizeChunkText = (text: string): string => {
  if (DEDUP_NORMALIZE_MODE === "simple") {
    // eslint-disable-next-line unicorn/prefer-string-replace-all
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  }
  return text.trim();
};

const fingerprintChunk = (text: string): string | null => {
  const normalized = normalizeChunkText(text);
  if (normalized.length < DEDUP_MIN_CHARS) {
    return null;
  }
  const head = normalized.slice(0, DEDUP_FINGERPRINT_CHARS);
  const tail = normalized.slice(-DEDUP_FINGERPRINT_CHARS);
  return `${normalized.length}:${head}:${tail}`;
};

const resolveDocId = (doc: RagDocument, index: number): string => {
  const meta = doc.metadata ?? {};
  return (
    (typeof meta.doc_id === "string" && meta.doc_id.trim()) ||
    (typeof doc.doc_id === "string" && doc.doc_id.trim()) ||
    (typeof meta.source_url === "string" && meta.source_url.trim()) ||
    (typeof doc.source_url === "string" && doc.source_url.trim()) ||
    (typeof meta.url === "string" && meta.url.trim()) ||
    `doc:${index}`
  );
};

export function dedupeSelectionDocuments(
  docs: RagDocument[],
  keyFn: (doc: RagDocument, index: number) => string | null,
  selectionUnit: SelectionUnit,
): SelectionDedupMetrics {
  const seen = new Set<string>();
  const uniqueKeys = new Set<string>();
  const deduped: RagDocument[] = [];

  for (const [index, doc] of docs.entries()) {
    const key = keyFn(doc, index);
    const uniqueKey = key ?? `__no-key:${selectionUnit}:${index}`;
    uniqueKeys.add(uniqueKey);
    if (!key) {
      deduped.push(doc);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(doc);
    }
  }

  const uniqueAfterDedupe = deduped.length;
  return {
    selectionUnit,
    inputCount: docs.length,
    uniqueBeforeDedupe: uniqueKeys.size,
    uniqueAfterDedupe,
    droppedByDedupe: docs.length - uniqueAfterDedupe,
    dedupedDocs: deduped,
  };
}

const COMMAND_KEYWORDS = [
  "delete",
  "reset",
  "ingest",
  "scrape",
  "crawl",
  "deploy",
  "restart",
  "shutdown",
  "drop table",
  "truncate",
  "rm -rf",
  "sudo",
  "build pipeline",
];

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

export function normalizeQuestion(raw: string): NormalizedQuestion {
  const normalized = raw.replaceAll(/\s+/g, " ").trim();
  const canonical = normalized
    .toLowerCase()
    .replaceAll(/[^a-z0-9가-힣\s]/g, " ");
  return {
    raw,
    normalized,
    canonical,
    language: detectLanguage(normalized),
  };
}

export function routeQuestion(
  normalized: NormalizedQuestion,
  history: GuardrailChatMessage[] = [],
  config: ChatGuardrailConfig,
): RoutedQuestion {
  const canonical = normalized.canonical;
  if (canonical.length === 0) {
    return {
      question: normalized,
      intent: "knowledge",
      confidence: 0.2,
      reason: "empty_after_normalization",
    };
  }

  if (isCommandIntent(canonical)) {
    return {
      question: normalized,
      intent: "command",
      confidence: 0.8,
      reason: "command_keyword_detected",
    };
  }

  if (isChitChatIntent(canonical, history, config.chitchatKeywords)) {
    return {
      question: normalized,
      intent: "chitchat",
      confidence: 0.75,
      reason: "chitchat_pattern_detected",
    };
  }

  return {
    question: normalized,
    intent: "knowledge",
    confidence: 0.6,
    reason: "default_knowledge_route",
  };
}

export function applyHistoryWindow(
  messages: GuardrailChatMessage[],
  config: ChatGuardrailConfig,
): HistoryWindowResult {
  if (messages.length === 0) {
    return {
      preserved: [],
      trimmed: [],
      tokenCount: 0,
      summaryMemory: null,
    };
  }

  const preserved: GuardrailChatMessage[] = [];
  const trimmed: GuardrailChatMessage[] = [];
  let tokensUsed = 0;
  const limit = config.historyTokenBudget;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const tokenCost = estimateMessageTokens(message);
    const shouldForceInclude =
      preserved.length === 0 || index === messages.length - 1;

    if (shouldForceInclude || tokensUsed + tokenCost <= limit) {
      preserved.unshift(message);
      tokensUsed = Math.min(limit, tokensUsed + tokenCost);
    } else {
      trimmed.unshift(message);
    }
  }

  const summaryMemory =
    config.summary.enabled && trimmed.length > 0
      ? buildSummaryMemory(trimmed, config.summary)
      : null;

  return {
    preserved,
    trimmed,
    tokenCount: tokensUsed,
    summaryMemory,
  };
}

export function buildContextWindow(
  documents: RagDocument[],
  config: ChatGuardrailConfig,
  options?: {
    includeVerboseDetails?: boolean;
    includeSelectionMetadata?: boolean;
  },
): ContextWindowResult {
  if (!documents || documents.length === 0) {
    return {
      contextBlock: "",
      included: [],
      dropped: 0,
      totalTokens: 0,
      insufficient: true,
      highestScore: 0,
    };
  }

  const normalizedDocs = documents
    .map((doc) => ({
      ...doc,
      chunk: doc.chunk ?? doc.content ?? doc.text ?? "",
    }))
    .filter(
      (doc) => typeof doc.chunk === "string" && doc.chunk.trim().length > 0,
    )
    // Node 18 does not include Array.prototype.toSorted yet.
    // eslint-disable-next-line unicorn/no-array-sort
    .sort((a, b) => getDocScore(b) - getDocScore(a));

  const chunkDedupe = dedupeSelectionDocuments(
    normalizedDocs,
    (doc) =>
      typeof doc.chunk === "string" ? fingerprintChunk(doc.chunk) : null,
    "chunk",
  );
  const docDedupe = dedupeSelectionDocuments(
    normalizedDocs,
    resolveDocId,
    "doc",
  );

  const rankedDocs = chunkDedupe.dedupedDocs;
  const finalK = config.ragTopK;
  const quotaStart = DEFAULT_MAX_CHUNKS_PER_DOC;
  let quotaEnd = quotaStart;
  let selectionMeta = {
    droppedByQuota: 0,
    uniqueDocs: 0,
  };
  let included: ContextWindowResult["included"] = [];
  let tokensUsed = 0;

  const selectWithQuota = (quota: number) => {
    const selected: ContextWindowResult["included"] = [];
    const selectedIndices = new Set<number>();
    const seenFingerprints = new Set<string>();
    const docCounts = new Map<string, number>();
    const countedDedupe = new Set<number>();
    const countedQuota = new Set<number>();
    let droppedByDedupe = 0;
    let droppedByQuota = 0;
    let localTokensUsed = 0;

    while (selected.length < finalK) {
      let bestIndex = -1;
      let bestDoc: RagDocument | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const [index, doc] of rankedDocs.entries()) {
        if (selectedIndices.has(index)) {
          continue;
        }
        const fingerprint = fingerprintChunk(doc.chunk!);
        if (fingerprint && seenFingerprints.has(fingerprint)) {
          if (!countedDedupe.has(index)) {
            countedDedupe.add(index);
            droppedByDedupe += 1;
          }
          continue;
        }
        const docId = resolveDocId(doc, index);
        const docCount = docCounts.get(docId) ?? 0;
        if (docCount >= quota) {
          if (!countedQuota.has(index)) {
            countedQuota.add(index);
            droppedByQuota += 1;
          }
          continue;
        }
        const similarityToSelected = docCount > 0 ? 1 : 0;
        const relevanceScore = getDocScore(doc);
        const effectiveScore =
          relevanceScore - MMR_LITE_LAMBDA * similarityToSelected;
        if (effectiveScore > bestScore) {
          bestScore = effectiveScore;
          bestIndex = index;
          bestDoc = doc;
        }
      }

      if (bestIndex < 0 || !bestDoc) {
        break;
      }

      const bestFingerprint = fingerprintChunk(bestDoc.chunk!);
      const bestDocId = resolveDocId(bestDoc, bestIndex);
      const clipped = clipTextToTokens(
        bestDoc.chunk!,
        config.ragContextClipTokens,
      );
      if (localTokensUsed + clipped.tokenCount > config.ragContextTokenBudget) {
        selectedIndices.add(bestIndex);
        continue;
      }
      if (bestFingerprint) {
        seenFingerprints.add(bestFingerprint);
      }
      docCounts.set(bestDocId, (docCounts.get(bestDocId) ?? 0) + 1);
      localTokensUsed += clipped.tokenCount;
      selectedIndices.add(bestIndex);
      selected.push({
        ...bestDoc,
        prunedChunk: clipped.text,
        clipped: clipped.clipped,
        tokenCount: clipped.tokenCount,
      });
    }

    return {
      selected,
      droppedByDedupe,
      droppedByQuota,
      uniqueDocs: docCounts.size,
      tokensUsed: localTokensUsed,
    };
  };

  for (
    let quota = quotaStart;
    quota <= MAX_RELAXED_CHUNKS_PER_DOC;
    quota += 1
  ) {
    const pass = selectWithQuota(quota);
    included = pass.selected;
    tokensUsed = pass.tokensUsed;
    quotaEnd = quota;
    selectionMeta = {
      droppedByQuota: pass.droppedByQuota,
      uniqueDocs: pass.uniqueDocs,
    };
    if (included.length >= finalK) {
      break;
    }
  }

  const contextBlock = included
    .map((doc, index) => {
      const metaLabel = buildDocumentLabel(doc);
      const headerParts = [`(${index + 1})`, metaLabel].filter(Boolean);
      const infoLine = headerParts.join(" ");
      return [infoLine, doc.prunedChunk.trim()].filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");

  const highestScoreDoc = chunkDedupe.dedupedDocs[0] ?? normalizedDocs[0];
  const highestScore = highestScoreDoc ? getDocScore(highestScoreDoc) : 0;
  const insufficient =
    highestScore < config.similarityThreshold || included.length === 0;

  return {
    contextBlock,
    included,
    dropped: chunkDedupe.dedupedDocs.length - included.length,
    totalTokens: tokensUsed,
    insufficient,
    highestScore,
    selection:
      options?.includeVerboseDetails || options?.includeSelectionMetadata
        ? {
            quotaStart,
            quotaEnd,
            quotaEndUsed: quotaEnd,
            droppedByDedupe: chunkDedupe.droppedByDedupe,
            droppedByQuota: selectionMeta.droppedByQuota,
            uniqueDocs: selectionMeta.uniqueDocs,
            selectionUnit: chunkDedupe.selectionUnit,
            inputCount: chunkDedupe.inputCount,
            uniqueBeforeDedupe: chunkDedupe.uniqueBeforeDedupe,
            uniqueAfterDedupe: chunkDedupe.uniqueAfterDedupe,
            finalSelectedCount: included.length,
            docSelection: {
              inputCount: docDedupe.inputCount,
              uniqueBeforeDedupe: docDedupe.uniqueBeforeDedupe,
              uniqueAfterDedupe: docDedupe.uniqueAfterDedupe,
              droppedByDedupe: docDedupe.droppedByDedupe,
            },
            mmrLite: true,
            mmrLambda: MMR_LITE_LAMBDA,
          }
        : undefined,
  };
}

export function buildIntentContextFallback(
  intent: ChatIntent,
  config: ChatGuardrailConfig,
): ContextWindowResult {
  switch (intent) {
    case "chitchat":
      return {
        contextBlock: config.fallbacks.chitchat,
        included: [],
        dropped: 0,
        totalTokens: 0,
        insufficient: true,
        highestScore: 0,
      };
    case "command":
      return {
        contextBlock: config.fallbacks.command,
        included: [],
        dropped: 0,
        totalTokens: 0,
        insufficient: true,
        highestScore: 0,
      };
    default:
      return {
        contextBlock: "",
        included: [],
        dropped: 0,
        totalTokens: 0,
        insufficient: true,
        highestScore: 0,
      };
  }
}

export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return encode(text).length;
}

function estimateMessageTokens(message: GuardrailChatMessage): number {
  const overhead = 4; // heuristically account for role + separators
  return estimateTokens(`${message.role}: ${message.content}`) + overhead;
}

function clipTextToTokens(
  text: string,
  limit: number,
): { text: string; clipped: boolean; tokenCount: number } {
  const tokens = encode(text);
  if (tokens.length <= limit) {
    return { text, clipped: false, tokenCount: tokens.length };
  }

  const truncated = tokens.slice(0, limit);
  const decoded = decode(truncated);
  return {
    text: `${decoded}…`,
    clipped: true,
    tokenCount: limit,
  };
}

function buildSummaryMemory(
  trimmed: GuardrailChatMessage[],
  summaryConfig: ChatGuardrailConfig["summary"],
): string | null {
  const recent = trimmed.slice(-summaryConfig.maxTurns);
  if (recent.length === 0) {
    return null;
  }
  const perLineBudget = Math.max(
    32,
    Math.floor(summaryConfig.maxChars / recent.length),
  );
  const lines = recent.map((message) => {
    const prefix = message.role === "assistant" ? "A" : "U";
    return `${prefix}: ${message.content.trim().slice(0, perLineBudget)}`;
  });
  const summary = lines.join("\n").slice(0, summaryConfig.maxChars).trim();
  return summary.length > 0 ? summary : null;
}

function detectLanguage(text: string): NormalizedQuestion["language"] {
  if (/[가-힣]/.test(text)) {
    return /[a-zA-Z]/.test(text) ? "mixed" : "ko";
  }
  if (/[a-zA-Z]/.test(text)) {
    return "en";
  }
  return "unknown";
}

function isChitChatIntent(
  canonical: string,
  history: GuardrailChatMessage[],
  keywords: string[],
): boolean {
  // 1. Explicit chitchat match for CURRENT message always wins.
  // This covers greetings, thanks, etc.
  if (keywords.some((keyword) => matchesChitchatKeyword(canonical, keyword))) {
    return true;
  }

  // 2. Only apply stickiness if the current message is "short" (likely ambiguous or conversational filler).
  // A query like "tell me about jack" (4 words) shouldn't be sticky chitchat.
  const wordCount = canonical.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2) {
    const userEntries = history.filter((msg) => msg.role === "user");
    const priorEntries = userEntries
      .slice(0, -1)
      .slice(-2)
      .map((msg) => msg.content.toLowerCase());

    if (priorEntries.length > 0) {
      return keywords.some((keyword) =>
        priorEntries.some((entry) => matchesChitchatKeyword(entry, keyword)),
      );
    }
  }

  // Otherwise, default to knowledge route (false) to allow RAG to be attempted.
  return false;
}

function isCommandIntent(canonical: string): boolean {
  return COMMAND_KEYWORDS.some((keyword) => canonical.includes(keyword));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDocScore(doc: RagDocument | undefined): number {
  if (!doc) {
    return 0;
  }

  if (typeof doc.similarity === "number") {
    return doc.similarity;
  }
  if (typeof doc.score === "number") {
    return doc.score;
  }
  if (typeof doc.similarity_score === "number") {
    return doc.similarity_score;
  }
  return 0;
}

function buildDocumentLabel(doc: RagDocument): string {
  const title = getDocumentTitle(doc);
  const source = getPublicSourceUrl(doc);

  if (title && source) {
    return `${title} (${source})`;
  }

  return title ?? source ?? "";
}

function getPublicSourceUrl(doc: RagDocument): string | null {
  const rawSource = getDocumentSourceUrl(doc);
  if (!rawSource) {
    return null;
  }

  const normalizedSource = normalizeUrl(rawSource);

  let parsed: URL;
  try {
    parsed = new URL(normalizedSource);
  } catch {
    return normalizedSource;
  }

  const hostname = parsed.hostname.toLowerCase();
  const derivedDocId =
    normalizePageId(getDocumentId(doc)) ||
    normalizePageId(getLastPathSegment(parsed.pathname));

  if (
    derivedDocId &&
    (hostname.includes("notion.so") || hostname.includes("notion.site"))
  ) {
    const rewritten = `${host.replace(/\/+$/, "")}/${derivedDocId}`;
    ragLogger.trace("[chat-guardrails:url]", {
      source: rawSource,
      docId: derivedDocId,
      rewritten,
    });
    return rewritten;
  }

  ragLogger.trace("[chat-guardrails:url:passthrough]", {
    source: rawSource,
  });

  return normalizedSource;
}

function getDocumentTitle(doc: RagDocument): string | null {
  const candidates = [doc.title, doc.metadata?.title];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function getDocumentSourceUrl(doc: RagDocument): string | null {
  const candidates = [
    doc.source_url,
    doc.sourceUrl,
    doc.metadata?.source_url,
    doc.metadata?.sourceUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function getDocumentId(doc: RagDocument): string | null {
  const candidates = [
    doc.doc_id,
    doc.docId,
    doc.document_id,
    doc.documentId,
    doc.id,
    doc.metadata?.doc_id,
    doc.metadata?.docId,
    doc.metadata?.page_id,
    doc.metadata?.pageId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && normalizePageId(trimmed)) {
        return trimmed;
      }
    }
  }

  return null;
}

function normalizeUrl(url: string): string {
  if (!url) {
    return url;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `https://${url.replace(/^\/+/, "")}`;
}

function getLastPathSegment(pathname: string): string | undefined {
  if (!pathname) {
    return undefined;
  }

  const segments = pathname.split("/").filter(Boolean);
  return segments.length > 0 ? segments.at(-1) : undefined;
}

function matchesChitchatKeyword(text: string, keyword: string): boolean {
  if (!text || !keyword) {
    return false;
  }

  if (text === keyword) {
    return true;
  }

  if (!text.startsWith(keyword)) {
    return false;
  }

  const remainder = text.slice(keyword.length).trim();
  if (!remainder) {
    return true;
  }

  const remainderWordCount = remainder.split(/\s+/).filter(Boolean).length;
  return remainderWordCount <= 2;
}
