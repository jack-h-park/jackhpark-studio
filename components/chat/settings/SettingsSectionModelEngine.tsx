"use client";

import { FiCpu } from "@react-icons/all-files/fi/FiCpu";
import { useMemo } from "react";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { listLlmModelOptions } from "@/lib/core/llm-registry";
import { Switch } from "@/components/ui/switch";

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
      <p className="settings-section__title heading-with-icon">
        <FiCpu aria-hidden="true" />
        Model &amp; Engine
      </p>
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

        <div className="settings-section__switches">
          {adminConfig.allowlist.allowReverseRAG ? (
            <div className="settings-section__switch">
              <p className="settings-section__switch-label">Reverse RAG</p>
              <Switch
                className="settings-section__switch-control"
                checked={sessionConfig.features.reverseRAG}
                onCheckedChange={(checked) =>
                  handleFieldChange((prev) => ({
                    ...prev,
                    features: {
                      ...prev.features,
                      reverseRAG: checked,
                    },
                  }))
                }
                aria-label="Toggle Reverse RAG"
              />
            </div>
          ) : null}
          {adminConfig.allowlist.allowHyde ? (
            <div className="settings-section__switch">
              <p className="settings-section__switch-label">HyDE</p>
              <Switch
                className="settings-section__switch-control"
                checked={sessionConfig.features.hyde}
                onCheckedChange={(checked) =>
                  handleFieldChange((prev) => ({
                    ...prev,
                    features: {
                      ...prev.features,
                      hyde: checked,
                    },
                  }))
                }
                aria-label="Toggle HyDE"
              />
            </div>
          ) : null}
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
