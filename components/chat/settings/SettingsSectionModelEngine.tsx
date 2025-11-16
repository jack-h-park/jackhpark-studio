"use client";

import { useMemo } from "react";

import type {
  AdminChatConfig,
  SessionChatConfig,
} from "@/types/chat-config";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { listLlmModelOptions } from "@/lib/core/llm-registry";

const ENGINE_LABELS: Record<string, string> = {
  lc: "LangChain",
  native: "Native",
};

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: ChatConfigSetter;
};

type ChatConfigSetter = (
  value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
) => void;

export function SettingsSectionModelEngine({
  adminConfig,
  sessionConfig,
  setSessionConfig,
}: Props) {
  const llmOptions = useMemo(() => {
    const allowlist = new Set(adminConfig.allowlist.llmModels);
    return listLlmModelOptions().filter((option) =>
      allowlist.has(option.id),
    );
  }, [adminConfig.allowlist.llmModels]);

  const embeddingOptions = useMemo(() => {
    const allowlist = new Set(adminConfig.allowlist.embeddingModels);
    return listEmbeddingModelOptions().filter((space) =>
      allowlist.has(space.embeddingSpaceId),
    );
  }, [adminConfig.allowlist.embeddingModels]);

  const handleFieldChange = (
    updater: (next: SessionChatConfig) => SessionChatConfig,
  ) => {
    setSessionConfig((prev) => {
      const next = updater(prev);
      return {
        ...next,
        appliedPreset: undefined,
      };
    });
  };

  return (
    <section className="settings-section">
      <p className="settings-section__title">Model &amp; Engine</p>
      <div className="settings-section__field">
        <label>
          LLM Model
          <select
            className="settings-section__select"
            value={sessionConfig.llmModel}
            onChange={(event) =>
              handleFieldChange((prev) => ({
                ...prev,
                llmModel: event.target.value,
              }))
            }
          >
            {llmOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Embedding Model
          <select
            className="settings-section__select"
            value={sessionConfig.embeddingModel}
            onChange={(event) =>
              handleFieldChange((prev) => ({
                ...prev,
                embeddingModel: event.target.value,
              }))
            }
          >
            {embeddingOptions.map((space) => (
              <option key={space.embeddingSpaceId} value={space.embeddingSpaceId}>
                {space.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Chat Engine
          <select
            className="settings-section__select"
            value={sessionConfig.chatEngine}
            onChange={(event) =>
              handleFieldChange((prev) => ({
                ...prev,
                chatEngine: event.target.value,
              }))
            }
          >
            {adminConfig.allowlist.chatEngines.map((engine) => (
              <option key={engine} value={engine}>
                {ENGINE_LABELS[engine] ?? engine}
              </option>
            ))}
          </select>
        </label>

        <div className="settings-section__grid">
          {adminConfig.allowlist.allowReverseRAG && (
            <label className="settings-section__checkbox">
              <input
                type="checkbox"
                checked={sessionConfig.features.reverseRAG}
                onChange={(event) =>
                  handleFieldChange((prev) => ({
                    ...prev,
                    features: {
                      ...prev.features,
                      reverseRAG: event.target.checked,
                    },
                  }))
                }
              />
              Reverse RAG
            </label>
          )}
          {adminConfig.allowlist.allowHyde && (
            <label className="settings-section__checkbox">
              <input
                type="checkbox"
                checked={sessionConfig.features.hyde}
                onChange={(event) =>
                  handleFieldChange((prev) => ({
                    ...prev,
                    features: {
                      ...prev.features,
                      hyde: event.target.checked,
                    },
                  }))
                }
              />
              HyDE
            </label>
          )}
        </div>

        <label>
          Ranker
          <select
            className="settings-section__select"
            value={sessionConfig.features.ranker}
            onChange={(event) =>
              handleFieldChange((prev) => ({
                ...prev,
                features: {
                  ...prev.features,
                  ranker: event.target.value,
                },
              }))
            }
          >
            {adminConfig.allowlist.rankers.map((ranker) => (
              <option key={ranker} value={ranker}>
                {ranker.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
