export type HistoryPreviewResult = {
  includedCount: number;
  excludedCount: number;
  includedIndices?: number[];
  excludedIndices?: number[];
  isEstimate: boolean;
  syntheticCount?: number;
  syntheticPreview?: Array<{ role: string; content: string }>;
};

// Fallback estimation: ~4 chars per token is a common rule of thumb for English text
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function computeHistoryPreview(args: {
  messages: Array<{ role: string; content: string }>;
  historyTokenBudget: number;
  summaryReplacementEnabled?: boolean;
}): HistoryPreviewResult {
  const { messages, historyTokenBudget } = args;

  if (!messages || messages.length === 0) {
    return {
      includedCount: 0,
      excludedCount: 0,
      isEstimate: false,
    };
  }

  let currentTokens = 0;
  let includedCount = 0;
  const includedIndices: number[] = [];
  const excludedIndices: number[] = [];

  // We process from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    // Simple estimation for now.
    // In a real app we might want to use a shared tokenizer if available.
    const tokens = estimateTokens(msg.content);

    // Check if adding this message exceeds budget
    if (currentTokens + tokens <= historyTokenBudget) {
      currentTokens += tokens;
      includedCount++;
      includedIndices.push(i);
    } else {
      // Once we hit the limit, all older messages (including this one) are excluded
      for (let j = i; j >= 0; j--) {
        excludedIndices.push(j);
      }
      break;
    }
  }

  // Ensure chronological order for UI
  includedIndices.sort((a, b) => a - b);
  excludedIndices.sort((a, b) => a - b);

  const excludedCount = messages.length - includedCount;

  return {
    includedCount,
    excludedCount,
    includedIndices,
    excludedIndices,
    isEstimate: true,
  };
}
