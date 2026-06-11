import type {
  ChatGuardrailConfig,
  GuardrailChatMessage,
  HistoryWindowResult,
} from "./types";
import { estimateMessageTokens } from "./tokens";

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
