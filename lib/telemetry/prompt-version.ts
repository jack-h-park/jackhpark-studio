import { createHash } from "node:crypto";

import type { AdminChatConfig } from "@/types/chat-config";

export function computeBasePromptVersion(
  adminConfig: AdminChatConfig,
  presetKey: keyof AdminChatConfig["presets"] | string,
): string {
  const preset =
    adminConfig.presets[
      presetKey as keyof typeof adminConfig.presets
    ] ?? adminConfig.presets.default;

  const base = [
    adminConfig.baseSystemPrompt,
    adminConfig.baseSystemPromptSummary,
    preset.additionalSystemPrompt,
  ]
    .filter(Boolean)
    .join("\n---\n");

  const hash = createHash("sha256").update(base).digest("hex");
  return hash.slice(0, 12);
}
