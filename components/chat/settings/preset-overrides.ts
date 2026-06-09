import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";

export const PRESET_LABELS = {
  precision: "Precision",
  default: "Balanced (Default)",
  fast: "Fast",
  highRecall: "High Recall",
} as const;

export type PresetKey = keyof typeof PRESET_LABELS;

export function resolvePresetKey(sessionConfig: SessionChatConfig): PresetKey {
  return (
    (sessionConfig.presetId as PresetKey | undefined) ??
    (sessionConfig.appliedPreset as PresetKey | undefined) ??
    "default"
  );
}

export function getPresetDefaults(
  adminConfig: AdminChatConfig,
  presetKey: PresetKey,
) {
  return adminConfig.presets[presetKey] ?? adminConfig.presets.default;
}

export function computeOverridesActive({
  adminConfig,
  sessionConfig,
}: {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
}) {
  const presetKey = resolvePresetKey(sessionConfig);
  const presetDefaults = getPresetDefaults(adminConfig, presetKey);
  const summaryMatches =
    sessionConfig.summaryLevel === presetDefaults.summaryLevel;
  const promptMatches =
    (sessionConfig.additionalSystemPrompt ?? "") ===
    (presetDefaults.additionalSystemPrompt ?? "");
  const llmMatches = sessionConfig.llmModel === presetDefaults.llmModel;
  const telemetryMatches =
    sessionConfig.showTelemetry === (presetDefaults.showTelemetry ?? false);
  const citationsMatches =
    sessionConfig.showCitations === (presetDefaults.showCitations ?? false);

  const resolvedPresetExists = Boolean(adminConfig.presets[presetKey]);

  return (
    !llmMatches ||
    !summaryMatches ||
    !promptMatches ||
    !telemetryMatches ||
    !citationsMatches ||
    (sessionConfig.appliedPreset === undefined && !resolvedPresetExists)
  );
}
