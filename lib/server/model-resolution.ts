import { DEFAULT_LLM_MODEL_ID } from "@/lib/core/llm-registry";
import { isOllamaEnabled } from "@/lib/core/ollama";
import type { AdminChatConfig } from "@/lib/server/admin-chat-config";
import {
  resolveLlmModelId,
  type ModelResolution,
} from "@/lib/shared/model-resolution";

type PresetKey = keyof AdminChatConfig["presets"];

export function buildPresetModelResolutions(
  config: AdminChatConfig,
): Record<PresetKey, ModelResolution> {
  const ollamaEnabled = isOllamaEnabled();
  const defaultModelId = DEFAULT_LLM_MODEL_ID;
  const allowedModelIds = config.allowlist?.llmModels ?? [];

  return (Object.keys(config.presets) as PresetKey[]).reduce<
    Record<PresetKey, ModelResolution>
  >((acc, presetKey) => {
    const preset = config.presets[presetKey];
    acc[presetKey] = resolveLlmModelId(preset.llmModel, {
      ollamaEnabled,
      defaultModelId,
      allowedModelIds,
    });
    return acc;
  }, {} as Record<PresetKey, ModelResolution>);
}
