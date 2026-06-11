import type { GuardrailRoute } from "@/lib/rag/types";
import { type LangfuseTrace } from "@/lib/langfuse";
import { telemetryLogger } from "@/lib/logging/logger";

type TagValue = string | null | undefined;

function normalizeTagValue(value: TagValue, fallback: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : fallback;
}

export type BuildLangfuseTraceTagsOptions = {
  intent?: TagValue;
  presetKey?: TagValue;
  environment?: TagValue;
};

export function buildLangfuseTraceTags({
  intent,
  presetKey,
  environment,
}: BuildLangfuseTraceTagsOptions): string[] {
  return [
    `intent:${normalizeTagValue(intent, "unknown")}`,
    `preset:${normalizeTagValue(presetKey, "unknown")}`,
    `env:${normalizeTagValue(environment, "unknown")}`,
  ];
}

function mergeLangfuseTags(
  existingTags: string[] | undefined,
  ...stableTags: string[]
): string[] {
  return Array.from(new Set([...(existingTags ?? []), ...stableTags]));
}

/**
 * Stable tags (env/preset/guardrail) used on the chat trace. Missing preset or
 * guardrail route is a telemetry contract violation, hence the error logs.
 */
export function buildStableLangfuseTags(
  existingTags: string[] | undefined,
  presetKey: string,
  guardrailRoute?: GuardrailRoute,
): string[] {
  const envTag = process.env.NODE_ENV === "production" ? "env:prod" : "env:dev";
  const normalizedPreset =
    typeof presetKey === "string" ? presetKey.trim() : "";
  const presetTag =
    normalizedPreset.length > 0
      ? `preset:${normalizedPreset}`
      : "preset:unknown";
  if (normalizedPreset.length === 0) {
    telemetryLogger.error(
      "[Langfuse] preset key missing when building trace tags; using preset:unknown",
    );
  }
  const guardrailTag =
    guardrailRoute !== undefined
      ? `guardrail:${guardrailRoute}`
      : "guardrail:normal";
  if (guardrailRoute === undefined) {
    telemetryLogger.error(
      "[Langfuse] guardrail route missing from chat config snapshot; using guardrail:normal",
    );
  }
  const tags = mergeLangfuseTags(existingTags, envTag, presetTag, guardrailTag);
  telemetryLogger.debug("[Langfuse] tags", { tags });
  return tags;
}

export type AttachLangfuseTraceTagsOptions = BuildLangfuseTraceTagsOptions & {
  trace: LangfuseTrace | null;
};

export function attachLangfuseTraceTags({
  trace,
  intent,
  presetKey,
  environment,
}: AttachLangfuseTraceTagsOptions): void {
  if (!trace) {
    return;
  }
  const tags = buildLangfuseTraceTags({ intent, presetKey, environment });
  void trace.update({ tags }).catch((err) =>
    telemetryLogger.debug("unable to attach Langfuse tags", {
      tags,
      error: err instanceof Error ? err.message : err,
    }),
  );
}
