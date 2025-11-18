"use client";

import { FiTarget } from "@react-icons/all-files/fi/FiTarget";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
};

const formatSimilarity = (value: number) => value.toFixed(2);

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
        <div className="flex justify-between items-baseline gap-3">
          <span>Top K</span>
          {/* <span>{sessionConfig.rag.topK}</span> */}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            className="w-full"
            min={ragTopK.min}
            max={ragTopK.max}
            step={1}
            disabled={!sessionConfig.rag.enabled}
            value={sessionConfig.rag.topK}
            onChange={(event) =>
              updateSession((prev) => ({
                ...prev,
                rag: {
                  ...prev.rag,
                  topK: Number(event.target.value),
                },
              }))
            }
          />
          <Input
            type="number"
            className="ai-field-sm ai-settings-section__number ai-settings-section__number--compact max-w-[110px] text-right"
            min={ragTopK.min}
            max={ragTopK.max}
            disabled={!sessionConfig.rag.enabled}
            value={sessionConfig.rag.topK}
            aria-label="Top K value"
            onChange={(event) =>
              updateSession((prev) => ({
                ...prev,
                rag: {
                  ...prev.rag,
                  topK: Math.round(Number(event.target.value) || 0),
                },
              }))
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-baseline gap-3">
          <span>Similarity Threshold</span>
          {/* <span>{formatSimilarity(sessionConfig.rag.similarity)}</span> */}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            className="w-full"
            min={similarityThreshold.min}
            max={similarityThreshold.max}
            step={0.01}
            disabled={!sessionConfig.rag.enabled}
            value={sessionConfig.rag.similarity}
            onChange={(event) =>
              updateSession((prev) => ({
                ...prev,
                rag: {
                  ...prev.rag,
                  similarity: Number(event.target.value),
                },
              }))
            }
          />
          <Input
            type="number"
            className="ai-field-sm ai-settings-section__number ai-settings-section__number--compact max-w-[110px] text-right"
            min={similarityThreshold.min}
            max={similarityThreshold.max}
            step={0.01}
            disabled={!sessionConfig.rag.enabled}
            value={sessionConfig.rag.similarity}
            aria-label="Similarity value"
            onChange={(event) =>
              updateSession((prev) => ({
                ...prev,
                rag: {
                  ...prev.rag,
                  similarity: Number(event.target.value),
                },
              }))
            }
          />
        </div>
      </div>
    </section>
  );
}
