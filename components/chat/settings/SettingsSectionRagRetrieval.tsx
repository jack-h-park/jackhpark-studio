"use client";

import { FiTarget } from "@react-icons/all-files/fi/FiTarget";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
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
    <section className="settings-section">
      <div className="settings-section__header">
        <p className="settings-section__title heading-with-icon">
          <FiTarget aria-hidden="true" />
          RAG &amp; Retrieval
        </p>
        <Switch
          className="settings-section__switch-control"
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

      <div className="settings-section__field">
        <div className="settings-section__field-row">
          <span>Top K</span>
          <span>{sessionConfig.rag.topK}</span>
        </div>
        <div className="settings-section__slider-row">
          <input
            type="range"
            className="settings-section__range"
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
          <input
            type="number"
            className="settings-section__number settings-section__number--compact"
            min={ragTopK.min}
            max={ragTopK.max}
            disabled={!sessionConfig.rag.enabled}
            value={sessionConfig.rag.topK}
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

      <div className="settings-section__field">
        <div className="settings-section__field-row">
          <span>Similarity Threshold</span>
          <span>{formatSimilarity(sessionConfig.rag.similarity)}</span>
        </div>
        <div className="settings-section__slider-row">
          <input
            type="range"
            className="settings-section__range"
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
          <input
            type="number"
            className="settings-section__number settings-section__number--compact"
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
        </div>
      </div>
    </section>
  );
}
