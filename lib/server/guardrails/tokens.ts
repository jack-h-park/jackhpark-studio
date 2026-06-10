import { decode, encode } from "gpt-tokenizer";

import type { GuardrailChatMessage } from "./types";

export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return encode(text).length;
}

export function estimateMessageTokens(message: GuardrailChatMessage): number {
  const overhead = 4; // heuristically account for role + separators
  return estimateTokens(`${message.role}: ${message.content}`) + overhead;
}

export function clipTextToTokens(
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
