import type { AppEnv } from "@/lib/langfuse";
import type { GuardrailRoute } from "@/lib/rag/types";

const PRESET_TAG_FALLBACK = "unknown";
const GUARDRAIL_TAG_FALLBACK: GuardrailRoute = "normal";

export function buildLangfuseTags(
  env: AppEnv,
  presetKey?: string,
  guardrailRoute?: GuardrailRoute,
): string[] {
  const normalizedEnv = env === "prod" ? "prod" : "dev";
  const normalizedPreset =
    presetKey && presetKey.trim().length > 0
      ? presetKey
      : PRESET_TAG_FALLBACK;
  const normalizedGuardrail = guardrailRoute ?? GUARDRAIL_TAG_FALLBACK;

  return [
    `env:${normalizedEnv}`,
    `preset:${normalizedPreset}`,
    `guardrail:${normalizedGuardrail}`,
  ];
}
