import type {
  AdminChatConfig,
  PresetModelResolutions,
} from "@/types/chat-config";
import { DEFAULT_LLM_MODEL_ID } from "@/lib/core/llm-registry";
import { isLmStudioConfigured } from "@/lib/core/lmstudio";
import { isOllamaConfigured } from "@/lib/core/ollama";
import { resolveLlmModelId } from "@/lib/shared/model-resolution";

type PresetKey = keyof AdminChatConfig["presets"];

export function buildPresetModelResolutions(
  config: AdminChatConfig,
): PresetModelResolutions {
  const ollamaConfigured = isOllamaConfigured();
  const lmstudioConfigured = isLmStudioConfigured();
  const defaultModelId = DEFAULT_LLM_MODEL_ID;
  const allowedModelIds = config.allowlist?.llmModels ?? [];

  return (
    Object.keys(config.presets) as PresetKey[]
  ).reduce<PresetModelResolutions>((acc, presetKey) => {
    const preset = config.presets[presetKey];
    acc[presetKey] = resolveLlmModelId(preset.llmModel, {
      ollamaConfigured,
      lmstudioConfigured,
      defaultModelId,
      allowedModelIds,
    });
    return acc;
  }, {} as PresetModelResolutions);
}
