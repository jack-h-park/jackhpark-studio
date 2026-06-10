import type { RankerId } from "@/lib/shared/models";
import type { SummaryLevel } from "@/types/chat-config";

/**
 * Canonical user-facing display names for chat settings values.
 * Single source for the chat settings drawer and the admin config UI so the
 * wording shown to visitors always matches what operators configure.
 */

export const PRESET_LABELS = {
  precision: "Precision",
  default: "Balanced (Default)",
  fast: "Fast",
  highRecall: "High Recall",
} as const;

export type PresetKey = keyof typeof PRESET_LABELS;

/** Short preset names for inline/toast copy where "(Default)" reads awkwardly. */
export const PRESET_LABELS_SHORT: Record<PresetKey, string> = {
  precision: "Precision",
  default: "Balanced",
  fast: "Fast",
  highRecall: "High Recall",
};

/** Render order for preset tiles/columns on every surface. */
export const PRESET_DISPLAY_ORDER: PresetKey[] = [
  "fast",
  "precision",
  "default",
  "highRecall",
];

export const SUMMARY_LEVEL_LABELS: Record<SummaryLevel, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const RANKER_LABELS: Record<RankerId, string> = {
  none: "None",
  mmr: "MMR",
  "cohere-rerank": "Cohere Rerank",
};

/** Verbose ranker labels for read-only summaries where a hint helps. */
export const RANKER_LABELS_VERBOSE: Record<RankerId, string> = {
  none: "None",
  mmr: "MMR (diversity)",
  "cohere-rerank": "Cohere Rerank",
};

export function formatRankerLabel(
  ranker: RankerId,
  opts?: { verbose?: boolean },
): string {
  const table = opts?.verbose ? RANKER_LABELS_VERBOSE : RANKER_LABELS;
  if (table[ranker]) return table[ranker];
  return ranker
    .split(/[-_]/)
    .map(
      (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join(" ");
}
