"use client";

import { FiTarget } from "@react-icons/all-files/fi/FiTarget";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { SliderNumberField } from "@/components/ui/slider-number-field";
import { Switch } from "@/components/ui/switch";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

export function SettingsSectionRagRetrieval({
  adminConfig,
  sessionConfig,
  setSessionConfig,
}: Props) {
  const updateSession = (
    updater: (next: SessionChatConfig) => SessionChatConfig,
  ) => {
    setSessionConfig((prev) => ({
      ...updater(prev),
      appliedPreset: undefined,
    }));
  };

  const { ragTopK, similarityThreshold } = adminConfig.numericLimits;

  return (
    <section className="ai-panel ai-settings-section">
      <div className="ai-settings-section__header flex items-center justify-between gap-3">
        <HeadingWithIcon
          as="p"
          icon={<FiTarget aria-hidden="true" />}
          className="ai-settings-section__title"
        >
          RAG &amp; Retrieval
        </HeadingWithIcon>
        <Switch
          className="flex-shrink-0"
          checked={sessionConfig.rag.enabled}
          onCheckedChange={(checked) =>
            updateSession((prev) => ({
              ...prev,
              rag: { ...prev.rag, enabled: checked },
            }))
          }
          aria-label="Toggle RAG retrieval"
        />
      </div>

      <div className="flex flex-col gap-3">
        <SliderNumberField
          id="settings-top-k"
          label="Top K"
          value={sessionConfig.rag.topK}
          min={ragTopK.min}
          max={ragTopK.max}
          step={1}
          disabled={!sessionConfig.rag.enabled}
          onChange={(topK) => {
            const sanitized = Math.max(
              ragTopK.min,
              Math.min(ragTopK.max, Math.round(topK)),
            );
            updateSession((prev) => ({
              ...prev,
              rag: {
                ...prev.rag,
                topK: sanitized,
              },
            }));
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SliderNumberField
          id="settings-similarity-threshold"
          label="Similarity Threshold"
          value={sessionConfig.rag.similarity}
          min={similarityThreshold.min}
          max={similarityThreshold.max}
          step={0.01}
          disabled={!sessionConfig.rag.enabled}
          onChange={(similarity) =>
            updateSession((prev) => ({
              ...prev,
              rag: {
                ...prev.rag,
                similarity,
              },
            }))
          }
        />
      </div>
    </section>
  );
}
