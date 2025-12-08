import type {
  AdminChatConfig,
  PresetModelResolutions,
} from "@/types/chat-config";
import { DEFAULT_LLM_MODEL_ID } from "@/lib/core/llm-registry";
import { isLmStudioEnabled } from "@/lib/core/lmstudio";
import { isOllamaEnabled } from "@/lib/core/ollama";
import { resolveLlmModelId } from "@/lib/shared/model-resolution";

type PresetKey = keyof AdminChatConfig["presets"];

export function buildPresetModelResolutions(
  config: AdminChatConfig,
): PresetModelResolutions {
  const ollamaEnabled = isOllamaEnabled();
  const lmstudioEnabled = isLmStudioEnabled();
  const defaultModelId = DEFAULT_LLM_MODEL_ID;
  const allowedModelIds = config.allowlist?.llmModels ?? [];

  return (
    Object.keys(config.presets) as PresetKey[]
  ).reduce<PresetModelResolutions>((acc, presetKey) => {
    const preset = config.presets[presetKey];
    acc[presetKey] = resolveLlmModelId(preset.llmModel, {
      ollamaEnabled,
      lmstudioEnabled,
      defaultModelId,
      allowedModelIds,
    });
    return acc;
  }, {} as PresetModelResolutions);
}
