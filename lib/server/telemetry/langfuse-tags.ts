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
