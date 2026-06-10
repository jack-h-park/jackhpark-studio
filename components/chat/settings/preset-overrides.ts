import type { PresetKey } from "@/lib/shared/chat-labels";
import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";

export { PRESET_LABELS, type PresetKey } from "@/lib/shared/chat-labels";

export type SetSessionConfig = (
  value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
) => void;

/**
 * Wraps setSessionConfig so every manual override also clears `appliedPreset`
 * — the signal that the session has diverged from its preset. All settings
 * sections must mutate session config through this wrapper.
 */
export const createSessionOverrideUpdater =
  (setSessionConfig: SetSessionConfig) =>
  (updater: (next: SessionChatConfig) => SessionChatConfig) => {
    setSessionConfig((prev) => ({
      ...updater(prev),
      appliedPreset: undefined,
    }));
  };

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
