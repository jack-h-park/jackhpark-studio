import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";

export function resolvePresetKey(
  adminConfig: AdminChatConfig,
  sessionConfig?: SessionChatConfig,
): string {
  const requestedPreset =
    sessionConfig?.presetId ?? sessionConfig?.appliedPreset ?? "default";
  if (
    requestedPreset === "fast" ||
    requestedPreset === "highRecall" ||
    (adminConfig.presets && requestedPreset in adminConfig.presets)
  ) {
    return requestedPreset;
  }
  return "default";
}
