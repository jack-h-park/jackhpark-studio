import { encode } from "gpt-tokenizer";

import { host } from "@/lib/config";
import { loadGuardrailSettings } from "@/lib/server/chat-settings";
import { normalizePageId } from "@/lib/server/page-url";

const DEBUG_RAG_URLS =
  (process.env.DEBUG_RAG_URLS ?? "").toLowerCase() === "true";

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
};

export type HistoryWindowResult = {
  preserved: GuardrailChatMessage[];
  trimmed: GuardrailChatMessage[];
  tokenCount: number;
  summaryMemory: string | null;
};

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
}): Promise<ChatGuardrailConfig> {
  const guardrailSettings = await loadGuardrailSettings({
    forceRefresh: options?.forceRefresh,
  });
  const numeric = guardrailSettings.numeric;

  return {
    similarityThreshold: clamp(numeric.similarityThreshold, 0, 1),
    ragTopK: Math.max(1, numeric.ragTopK),
    ragContextTokenBudget: Math.max(200, numeric.ragContextTokenBudget),
    ragContextClipTokens: Math.max(64, numeric.ragContextClipTokens),
    historyTokenBudget: Math.max(200, numeric.historyTokenBudget),
    summary: {
      enabled: numeric.summaryEnabled,
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

  const topDocs = normalizedDocs.slice(0, config.ragTopK);
  const included: ContextWindowResult["included"] = [];
  let tokensUsed = 0;

  for (const doc of topDocs) {
    const clipped = clipTextToTokens(doc.chunk!, config.ragContextClipTokens);
    if (tokensUsed + clipped.tokenCount > config.ragContextTokenBudget) {
      break;
    }

    tokensUsed += clipped.tokenCount;
    included.push({
      ...doc,
      prunedChunk: clipped.text,
      clipped: clipped.clipped,
      tokenCount: clipped.tokenCount,
    });
  }

  const contextBlock = included
    .map((doc, index) => {
      const metaLabel = buildDocumentLabel(doc);
      const headerParts = [`(${index + 1})`, metaLabel].filter(Boolean);
      const infoLine = headerParts.join(" ");
      return [infoLine, doc.prunedChunk.trim()].filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");

  const highestScore = getDocScore(normalizedDocs[0]);
  const insufficient =
    highestScore < config.similarityThreshold || included.length === 0;

  return {
    contextBlock,
    included,
    dropped: normalizedDocs.length - included.length,
    totalTokens: tokensUsed,
    insufficient,
    highestScore,
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
  const decoded = safeDecode(truncated);
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
  const userEntries = history.filter((msg) => msg.role === "user");
  const priorEntries = userEntries
    .slice(0, -1)
    .slice(-2)
    .map((msg) => msg.content.toLowerCase());

  if (keywords.some((keyword) => matchesChitchatKeyword(canonical, keyword))) {
    return true;
  }

  if (priorEntries.length === 0) {
    return false;
  }

  return keywords.some((keyword) =>
    priorEntries.some((entry) => matchesChitchatKeyword(entry, keyword)),
  );
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
    if (DEBUG_RAG_URLS) {
      console.log("[chat-guardrails:url]", {
        source: rawSource,
        docId: derivedDocId,
        rewritten,
      });
    }
    return rewritten;
  }

  if (DEBUG_RAG_URLS) {
    console.log("[chat-guardrails:url:passthrough]", {
      source: rawSource,
    });
  }

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

function safeDecode(tokens: number[]): string {
  const decoder = new TextDecoder();
  while (tokens.length > 0) {
    try {
      return decoder.decode(new Uint8Array(tokens));
    } catch {
      // The byte sequence is likely invalid, which can happen if a multi-byte
      // character is cut in the middle. Remove the last token and retry.
      tokens.pop();
    }
  }
  return "";
}
