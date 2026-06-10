import type {
  ChatGuardrailConfig,
  GuardrailChatMessage,
  NormalizedQuestion,
  RoutedQuestion,
} from "./types";

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
