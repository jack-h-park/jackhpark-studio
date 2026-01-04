import { useCallback, useEffect, useMemo, useState } from "react";

import type { LocalLlmBackend } from "@/lib/local-llm/client";
import type {
  DOC_TYPE_OPTIONS,
  PERSONA_TYPE_OPTIONS,
} from "@/lib/rag/metadata";
import { normalizeLlmModelId } from "@/lib/core/llm-registry";
import { type ModelProvider } from "@/lib/shared/model-provider";
import {
  type EmbeddingModelId,
  LLM_MODEL_DEFINITIONS,
  type LlmModelDefinition,
  type LlmModelId,
  type RankerId,
} from "@/lib/shared/models";
import {
  type AdminChatConfig,
  type AdminChatRuntimeMeta,
  type AdminNumericLimit,
  getAdditionalPromptMaxLength,
  type SessionChatConfigPreset,
} from "@/types/chat-config";

export type SaveStatus = "idle" | "saving" | "success" | "error";
type SaveConfigResponse = {
  updatedAt?: string | null;
  error?: string;
};

export type UseAdminChatConfigParams = {
  adminConfig: AdminChatConfig;
  lastUpdatedAt: string | null;
  runtimeMeta: AdminChatRuntimeMeta;
};

export type PresetKey = keyof AdminChatConfig["presets"];

const LLM_MODEL_DEFINITIONS_MAP = new Map<LlmModelId, LlmModelDefinition>(
  LLM_MODEL_DEFINITIONS.map((definition) => [
    definition.id as LlmModelId,
    definition as LlmModelDefinition,
  ]),
);

export const RAG_WEIGHT_MIN = 0.1;
export const RAG_WEIGHT_MAX = 3;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const clampWeight = (value: number) =>
  clamp(Number.isFinite(value) ? value : 0, RAG_WEIGHT_MIN, RAG_WEIGHT_MAX);

export const numericLimitLabels: Record<
  keyof AdminChatConfig["numericLimits"],
  string
> = {
  ragTopK: "RAG Top K",
  similarityThreshold: "Similarity Threshold",
  contextBudget: "Context Token Budget",
  historyBudget: "History Budget",
  clipTokens: "Clip Tokens",
};

export const presetDisplayNames: Record<PresetKey, string> = {
  default: "Balanced (Default)",
  fast: "Fast",
  highRecall: "High Recall",
  precision: "Precision",
};

export const presetDisplayOrder: PresetKey[] = [
  "precision",
  "default",
  "highRecall",
  "fast",
];

export type AdminLlmModelOption = {
  id: LlmModelId;
  label: string;
  displayName: string;
  provider: ModelProvider;
  isLocal: boolean;
  localBackend?: LocalLlmBackend;
  subtitle?: string;
};

export function useAdminChatConfig({
  adminConfig,
  lastUpdatedAt,
  runtimeMeta,
}: UseAdminChatConfigParams) {
  const [config, setConfig] = useState<AdminChatConfig>(() => ({
    ...adminConfig,
  }));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(lastUpdatedAt);
  const [isRawModalOpen, setIsRawModalOpen] = useState(false);
  const [isWordWrapEnabled, setIsWordWrapEnabled] = useState(false);
  const [contextHistoryEnabled, setContextHistoryEnabled] = useState<
    Record<PresetKey, boolean>
  >(() =>
    presetDisplayOrder.reduce<Record<PresetKey, boolean>>(
      (acc, presetKey) => {
        acc[presetKey] = true;
        return acc;
      },
      {} as Record<PresetKey, boolean>,
    ),
  );

  useEffect(() => {
    setConfig(adminConfig);
  }, [adminConfig]);

  const additionalPromptMaxLength = getAdditionalPromptMaxLength(config);

  const updateConfig = useCallback(
    (updater: (prev: AdminChatConfig) => AdminChatConfig) => {
      setConfig((prev) => updater(prev));
    },
    [],
  );

  const numericLimitErrors = useMemo(() => {
    const errors: string[] = [];
    for (const [key, limit] of Object.entries(config.numericLimits)) {
      const parsedKey = key as keyof AdminChatConfig["numericLimits"];
      if (limit.min > limit.max) {
        errors.push(`${numericLimitLabels[parsedKey]} min must be ≤ max.`);
        continue;
      }
      if (limit.default < limit.min || limit.default > limit.max) {
        errors.push(
          `${numericLimitLabels[parsedKey]} default must sit within the min/max range.`,
        );
        continue;
      }
      if (
        parsedKey === "similarityThreshold" &&
        (limit.min < 0 ||
          limit.max > 1 ||
          limit.default < 0 ||
          limit.default > 1)
      ) {
        errors.push("Similarity threshold values must stay between 0 and 1.");
      }
    }
    return errors;
  }, [config.numericLimits]);

  const hasNumericErrors = numericLimitErrors.length > 0;

  const isFormBusy = saveStatus === "saving";
  const isSaveDisabled = hasNumericErrors || isFormBusy;

  const handleSave = async () => {
    if (isSaveDisabled) {
      return;
    }
    setSaveStatus("saving");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/chat-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as SaveConfigResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save chat config.");
      }
      setLastSavedAt(payload?.updatedAt ?? new Date().toISOString());
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to save chat configuration.";
      setErrorMessage(message);
      setSaveStatus("error");
    }
  };

  const updateNumericLimit = (
    key: keyof AdminChatConfig["numericLimits"],
    field: keyof AdminNumericLimit,
    value: number,
  ) => {
    updateConfig((prev) => ({
      ...prev,
      numericLimits: {
        ...prev.numericLimits,
        [key]: {
          ...prev.numericLimits[key],
          [field]: value,
        },
      },
    }));
  };

  const updateDocTypeWeight = (
    docType: (typeof DOC_TYPE_OPTIONS)[number],
    value: number,
  ) => {
    const clamped = clampWeight(value);
    updateConfig((prev) => ({
      ...prev,
      ragRanking: {
        docTypeWeights: {
          ...prev.ragRanking?.docTypeWeights,
          [docType]: clamped,
        },
        personaTypeWeights: {
          ...prev.ragRanking?.personaTypeWeights,
        },
      },
    }));
  };

  const updatePersonaWeight = (
    persona: (typeof PERSONA_TYPE_OPTIONS)[number],
    value: number,
  ) => {
    const clamped = clampWeight(value);
    updateConfig((prev) => ({
      ...prev,
      ragRanking: {
        docTypeWeights: {
          ...prev.ragRanking?.docTypeWeights,
        },
        personaTypeWeights: {
          ...prev.ragRanking?.personaTypeWeights,
          [persona]: clamped,
        },
      },
    }));
  };

  type AllowlistKey = "llmModels" | "embeddingModels" | "rankers";
  type AllowlistValueMap = {
    llmModels: LlmModelId;
    embeddingModels: EmbeddingModelId;
    rankers: RankerId;
  };

  const toggleAllowlistValue = <K extends AllowlistKey>(
    key: K,
    value: AllowlistValueMap[K],
    enable = true,
  ) => {
    updateConfig((prev) => {
      const current = prev.allowlist[key] as AllowlistValueMap[K][];

      if (key === "llmModels") {
        const normalizedValue =
          normalizeLlmModelId(value as LlmModelId) ?? (value as LlmModelId);
        const matchesNormalized = (entry: LlmModelId) =>
          (normalizeLlmModelId(entry) ?? entry) === normalizedValue;
        const includesValue = current.some((entry) =>
          matchesNormalized(entry as LlmModelId),
        );
        if (enable && includesValue) {
          return prev;
        }
        if (!enable && !includesValue) {
          return prev;
        }
        const next = enable
          ? [
              ...(current.filter(
                (entry) => !matchesNormalized(entry as LlmModelId),
              ) as LlmModelId[]),
              normalizedValue,
            ]
          : (current.filter(
              (entry) => !matchesNormalized(entry as LlmModelId),
            ) as LlmModelId[]);
        const sortedNext = next.toSorted((a, b) => a.localeCompare(b));
        return {
          ...prev,
          allowlist: {
            ...prev.allowlist,
            [key]: sortedNext as AdminChatConfig["allowlist"][K],
          },
        };
      }

      const includesValue = current.includes(value);
      if (enable && includesValue) {
        return prev;
      }
      if (!enable && !includesValue) {
        return prev;
      }
      const next = enable
        ? [...current, value]
        : current.filter((item) => item !== value);
      const sortedNext = next.toSorted((a, b) =>
        String(a).localeCompare(String(b)),
      );
      return {
        ...prev,
        allowlist: {
          ...prev.allowlist,
          [key]: sortedNext as AdminChatConfig["allowlist"][K],
        },
      };
    });
  };

  const updatePreset = (
    presetName: PresetKey,
    updater: (preset: SessionChatConfigPreset) => SessionChatConfigPreset,
  ) => {
    updateConfig((prev) => ({
      ...prev,
      presets: {
        ...prev.presets,
        [presetName]: updater(prev.presets[presetName]),
      },
    }));
  };

  const llmModelUnionIds = useMemo(() => {
    const baseIds = LLM_MODEL_DEFINITIONS.map(
      (definition) => definition.id,
    ) as LlmModelId[];
    const normalizedAllowlistIds = config.allowlist.llmModels
      .map((id) => normalizeLlmModelId(id) ?? id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const union = new Set<string>([...baseIds, ...normalizedAllowlistIds]);
    return [...union].toSorted((a, b) => a.localeCompare(b)) as LlmModelId[];
  }, [config.allowlist.llmModels]);

  const llmModelOptions = useMemo(
    () =>
      llmModelUnionIds.map((id) => {
        const definition = LLM_MODEL_DEFINITIONS_MAP.get(id);
        return {
          id,
          label: definition?.label ?? id,
          displayName: definition?.displayName ?? definition?.label ?? id,
          provider: definition?.provider ?? "openai",
          isLocal: definition?.isLocal ?? Boolean(definition?.localBackend),
          localBackend: definition?.localBackend,
          subtitle: definition?.subtitle,
        };
      }),
    [llmModelUnionIds],
  );

  return {
    config,
    updateConfig,
    saveStatus,
    errorMessage,
    lastSavedAt,
    handleSave,
    isRawModalOpen,
    setIsRawModalOpen,
    isWordWrapEnabled,
    setIsWordWrapEnabled,
    contextHistoryEnabled,
    setContextHistoryEnabled,
    additionalPromptMaxLength,
    numericLimitErrors,
    hasNumericErrors,
    isFormBusy,
    isSaveDisabled,
    llmModelOptions,
    updateNumericLimit,
    updateDocTypeWeight,
    updatePersonaWeight,
    toggleAllowlistValue,
    updatePreset,
    runtimeMeta,
  } as const;
}
