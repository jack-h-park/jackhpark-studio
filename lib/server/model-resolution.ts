import type {
  AdminChatConfig,
  PresetModelResolutions,
} from "@/types/chat-config";
import {
  DEFAULT_LLM_MODEL_ID,
  IS_DEFAULT_MODEL_EXPLICIT,
} from "@/lib/core/llm-registry";
import { isLmStudioConfigured } from "@/lib/core/lmstudio";
import { isOllamaConfigured } from "@/lib/core/ollama";
import {
  type ModelResolutionContext,
  resolveLlmModelId,
} from "@/lib/shared/model-resolution";

type PresetKey = keyof AdminChatConfig["presets"];

/**
 * Single server-side source for the environment-dependent resolution context
 * (local backend availability, default model, allowlist). All callers of
 * resolveLlmModelId on the server must build their context here so runtime
 * resolution and admin-facing preset previews can never drift.
 */
export function buildModelResolutionContext(
  config: AdminChatConfig,
): ModelResolutionContext {
  return {
    ollamaConfigured: isOllamaConfigured(),
    lmstudioConfigured: isLmStudioConfigured(),
    defaultModelId: DEFAULT_LLM_MODEL_ID,
    defaultModelExplicit: IS_DEFAULT_MODEL_EXPLICIT,
    allowedModelIds: config.allowlist?.llmModels,
  };
}

export function buildPresetModelResolutions(
  config: AdminChatConfig,
): PresetModelResolutions {
  const context = buildModelResolutionContext(config);

  return (
    Object.keys(config.presets) as PresetKey[]
  ).reduce<PresetModelResolutions>((acc, presetKey) => {
    const preset = config.presets[presetKey];
    acc[presetKey] = resolveLlmModelId(preset.llmModel, context);
    return acc;
  }, {} as PresetModelResolutions);
}
