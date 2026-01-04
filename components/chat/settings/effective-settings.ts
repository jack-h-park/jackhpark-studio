import type { RankerId } from "@/lib/shared/models";
import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";

import packageJson from "../../../package.json";
import {
  getPresetDefaults,
  PRESET_LABELS,
  resolvePresetKey,
} from "./preset-overrides";

const SUMMARY_LEVEL_LABELS: Record<SummaryLevel, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const RANKER_LABELS: Record<RankerId, string> = {
  none: "None",
  mmr: "MMR (diversity)",
  "cohere-rerank": "Cohere rerank",
};

const formatRankerLabel = (ranker: RankerId) => {
  if (RANKER_LABELS[ranker]) return RANKER_LABELS[ranker];
  return ranker
    .split(/[-_]/)
    .map(
      (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join(" ");
};

const APP_VERSION = packageJson?.version;

export type EffectiveSettingsPayload = {
  schemaVersion: number;
  generatedAt: string;
  presetId?: string;
  presetName?: string;
  appVersion?: string;
  overridesActive: boolean;
  effectiveLLMModel: string;
  effectiveEmbeddingsLabel: string;
  retrieval: {
    enabled: boolean;
    topK: number;
    similarityThreshold: number;
    reverseRag: boolean;
    hyde: boolean;
    ranker: {
      friendly: string;
      raw: RankerId;
    };
  };
  budgets: {
    tokenBudget: number;
    historyBudget: number;
    clipTokens: number;
  };
  summaries: {
    presetDefault?: string;
    current: string;
  };
  userPrompt: {
    present: boolean;
    length: number;
  };
};

type Params = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  overridesActive: boolean;
  effectiveEmbeddingLabel: string;
  timestamp?: string;
};

export function buildEffectiveSettingsPayload({
  adminConfig,
  sessionConfig,
  overridesActive,
  effectiveEmbeddingLabel,
  timestamp,
}: Params): EffectiveSettingsPayload {
  const generatedAt = timestamp ?? new Date().toISOString();
  const presetKey = resolvePresetKey(sessionConfig);
  const presetDefaults = getPresetDefaults(adminConfig, presetKey);
  const presetName = PRESET_LABELS[presetKey];

  return {
    schemaVersion: 1,
    generatedAt,
    presetId: sessionConfig.presetId ?? sessionConfig.appliedPreset,
    presetName,
    appVersion: APP_VERSION,
    overridesActive,
    effectiveLLMModel: sessionConfig.llmModel,
    effectiveEmbeddingsLabel: effectiveEmbeddingLabel,
    retrieval: {
      enabled: sessionConfig.rag.enabled,
      topK: sessionConfig.rag.topK,
      similarityThreshold: sessionConfig.rag.similarity,
      reverseRag: sessionConfig.features.reverseRAG,
      hyde: sessionConfig.features.hyde,
      ranker: {
        friendly: formatRankerLabel(sessionConfig.features.ranker),
        raw: sessionConfig.features.ranker,
      },
    },
    budgets: {
      tokenBudget: sessionConfig.context.tokenBudget,
      historyBudget: sessionConfig.context.historyBudget,
      clipTokens: sessionConfig.context.clipTokens,
    },
    summaries: {
      presetDefault:
        presetDefaults && presetDefaults.summaryLevel
          ? SUMMARY_LEVEL_LABELS[presetDefaults.summaryLevel]
          : undefined,
      current: SUMMARY_LEVEL_LABELS[sessionConfig.summaryLevel],
    },
    userPrompt: {
      present: Boolean(sessionConfig.additionalSystemPrompt),
      length: sessionConfig.additionalSystemPrompt?.length ?? 0,
    },
  };
}

export function buildEffectiveSettingsSupportLine(
  payload: EffectiveSettingsPayload,
): string {
  const retrieval = payload.retrieval;
  const budgets = payload.budgets;
  const summaries = payload.summaries;
  const promptDescriptor = payload.userPrompt.present
    ? `present(len=${payload.userPrompt.length})`
    : "absent";
  const presetLabel = payload.presetName ?? payload.presetId ?? "Unknown";

  return `Preset=${presetLabel}; OverridesActive=${
    payload.overridesActive ? "true" : "false"
  }; LLM=${payload.effectiveLLMModel}; Embeddings=${
    payload.effectiveEmbeddingsLabel
  }; Retrieval=${retrieval.enabled ? "on" : "off"} topK=${
    retrieval.topK
  } sim>=${retrieval.similarityThreshold.toFixed(2)}; Capabilities=reverseRag:${
    retrieval.reverseRag ? "ON" : "off"
  } hyde:${retrieval.hyde ? "ON" : "off"}; Ranker=${retrieval.ranker.friendly}; Budgets=ctx${budgets.tokenBudget} hist${budgets.historyBudget} clip${budgets.clipTokens}; Summaries=preset:${
    summaries.presetDefault ?? "n/a"
  } current:${summaries.current}; Prompt=${promptDescriptor}`;
}
