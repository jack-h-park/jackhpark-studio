import type { TelemetryDetailLevel } from "@/types/chat-config";

export type TelemetryDecision = {
  shouldEmitTrace: boolean;
  includeConfigSnapshot: boolean;
  includeRetrievalDetails: boolean;
};

export function decideTelemetryMode(
  sampleRate: number,
  detailLevel: TelemetryDetailLevel,
  random: () => number = Math.random,
): TelemetryDecision {
  const r = random();
  const shouldEmitTrace = sampleRate > 0 && r <= sampleRate;

  if (!shouldEmitTrace) {
    return {
      shouldEmitTrace: false,
      includeConfigSnapshot: false,
      includeRetrievalDetails: false,
    };
  }

  const includeConfigSnapshot = detailLevel !== "minimal";
  const includeRetrievalDetails = detailLevel === "verbose";

  return {
    shouldEmitTrace,
    includeConfigSnapshot,
    includeRetrievalDetails,
  };
}
