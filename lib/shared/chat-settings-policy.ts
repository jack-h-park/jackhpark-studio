/**
 * Policy definitions for Chat Settings.
 *
 * Defines which settings are "User Tunable" (can be overridden by the client)
 * and which are "Preset Managed" (enforced by the server based on the selected preset).
 */

import type { SessionChatConfig } from "../../types/chat-config";

/**
 * Keys in SessionChatConfig that the user is allowed to modify directly.
 * All other keys are ignored/overwritten by the server using the active Preset.
 */
export const USER_TUNABLE_KEYS: (keyof SessionChatConfig)[] = [
  "presetId",
  "llmModel",
  "summaryLevel",
  "additionalSystemPrompt",
];

/**
 * Type guard to check if a key is user tunable.
 */
export function isUserTunableKey(key: string): key is keyof SessionChatConfig {
  return USER_TUNABLE_KEYS.includes(key as keyof SessionChatConfig);
}

/**
 * Helper to determine if a specific setting field should be read-only in the UI.
 * @param key The setting key (top-level)
 */
export function isSettingLocked(key: keyof SessionChatConfig): boolean {
  return !isUserTunableKey(key);
}
