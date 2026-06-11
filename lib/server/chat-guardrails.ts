/**
 * Barrel for the chat guardrail modules. The implementation is split by
 * concern under lib/server/guardrails/; this module preserves the historical
 * import path for existing callers.
 */
export {
  buildContextWindow,
  buildIntentContextFallback,
  dedupeSelectionDocuments,
} from "./guardrails/context-window";
export {
  getChatGuardrailConfig,
  sanitizeChatSettings,
} from "./guardrails/guardrail-config";
export { applyHistoryWindow } from "./guardrails/history-window";
export {
  normalizeQuestion,
  routeQuestion,
} from "./guardrails/question-routing";
export { estimateTokens } from "./guardrails/tokens";
export type {
  ChatGuardrailConfig,
  ChatIntent,
  ContextSelectionMetrics,
  ContextWindowResult,
  GuardrailChatMessage,
  HistoryWindowResult,
  NormalizedQuestion,
  RagDocument,
  RoutedQuestion,
  SanitizationChange,
  SelectionDedupMetrics,
  SelectionUnit,
} from "./guardrails/types";
