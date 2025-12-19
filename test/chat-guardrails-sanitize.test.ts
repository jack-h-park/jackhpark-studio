import assert from "node:assert/strict";
import test from "node:test";

import {
  type ChatGuardrailConfig,
  sanitizeChatSettings,
} from "@/lib/server/chat-guardrails";
import {
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_MODE,
} from "@/lib/shared/rag-config";

const buildGuardrails = (
  overrides: Partial<ChatGuardrailConfig> = {},
): ChatGuardrailConfig => ({
  similarityThreshold: 0.2,
  ragTopK: 5,
  ragContextTokenBudget: 1024,
  ragContextClipTokens: 256,
  historyTokenBudget: 512,
  summary: {
    enabled: true,
    triggerTokens: 400,
    maxChars: 1000,
    maxTurns: 8,
  },
  chitchatKeywords: [],
  fallbacks: {
    chitchat: "",
    command: "",
  },
  ...overrides,
});

void test("sanitizeChatSettings clamps out-of-range values and enums", () => {
  const guardrails = buildGuardrails({
    similarityThreshold: 2,
    ragTopK: 30,
    ragContextTokenBudget: 100,
    ragContextClipTokens: 5000,
    historyTokenBudget: -5,
    summary: {
      enabled: "true" as unknown as boolean,
      triggerTokens: 50,
      maxChars: 100,
      maxTurns: 100,
    },
  });

  const result = sanitizeChatSettings({
    guardrails,
    runtimeFlags: {
      reverseRagEnabled: "true" as unknown as boolean,
      reverseRagMode: "unknown" as any,
      hydeEnabled: "false" as unknown as boolean,
      rankerMode: "invalid" as any,
    },
  });

  assert.equal(result.guardrails.similarityThreshold, 0.9);
  assert.equal(result.guardrails.ragTopK, 20);
  assert.equal(result.guardrails.ragContextTokenBudget, 256);
  assert.equal(result.guardrails.ragContextClipTokens, 1024);
  assert.equal(result.guardrails.historyTokenBudget, 0);
  assert.equal(result.guardrails.summary.triggerTokens, 200);
  assert.equal(result.guardrails.summary.maxChars, 200);
  assert.equal(result.guardrails.summary.maxTurns, 50);
  assert.equal(result.guardrails.summary.enabled, true);
  assert.equal(result.runtimeFlags.reverseRagEnabled, true);
  assert.equal(result.runtimeFlags.hydeEnabled, false);
  assert.equal(result.runtimeFlags.reverseRagMode, DEFAULT_REVERSE_RAG_MODE);
  assert.equal(result.runtimeFlags.rankerMode, DEFAULT_RANKER_MODE);
  assert.ok(result.changes.length > 0);
});

void test("sanitizeChatSettings preserves safe values", () => {
  const guardrails = buildGuardrails();
  const result = sanitizeChatSettings({
    guardrails,
    runtimeFlags: {
      reverseRagEnabled: false,
      reverseRagMode: DEFAULT_REVERSE_RAG_MODE,
      hydeEnabled: true,
      rankerMode: DEFAULT_RANKER_MODE,
    },
  });

  assert.equal(result.guardrails.ragTopK, guardrails.ragTopK);
  assert.equal(result.guardrails.similarityThreshold, guardrails.similarityThreshold);
  assert.equal(result.guardrails.ragContextTokenBudget, guardrails.ragContextTokenBudget);
  assert.equal(result.guardrails.ragContextClipTokens, guardrails.ragContextClipTokens);
  assert.equal(result.guardrails.historyTokenBudget, guardrails.historyTokenBudget);
  assert.equal(result.runtimeFlags.reverseRagEnabled, false);
  assert.equal(result.runtimeFlags.hydeEnabled, true);
  assert.equal(result.changes.length, 0);
});
