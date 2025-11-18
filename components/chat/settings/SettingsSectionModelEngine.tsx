"use client";

import { FiCpu } from "@react-icons/all-files/fi/FiCpu";
import { useMemo } from "react";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
    const availableOptions = listLlmModelOptions();
    const filtered = availableOptions.filter((option) =>
      allowlist.has(option.id),
    );
    return filtered.length > 0 ? filtered : availableOptions;
  }, [adminConfig.allowlist.llmModels]);

  const embeddingOptions = useMemo(() => {
    const allowlist = new Set(adminConfig.allowlist.embeddingModels);
    const availableSpaces = listEmbeddingModelOptions();
    const filtered = availableSpaces.filter((space) =>
      allowlist.has(space.embeddingSpaceId),
    );
    return filtered.length > 0 ? filtered : availableSpaces;
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
    <section className="ai-panel ai-settings-section">
      <HeadingWithIcon
        as="p"
        icon={<FiCpu aria-hidden="true" />}
        className="ai-settings-section__title"
      >
        Model &amp; Engine
      </HeadingWithIcon>
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <Label htmlFor="settings-llm-model">LLM Model</Label>
          <Select
            value={sessionConfig.llmModel}
            onValueChange={(value) =>
              handleFieldChange((prev) => ({
                ...prev,
                llmModel: value,
              }))
            }
          >
            <SelectTrigger
              id="settings-llm-model"
              aria-label="LLM model selection"
              className="ai-field-sm w-full"
            />
            <SelectContent>
              {llmOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="settings-embedding-model">Embedding Model</Label>
          <Select
            value={sessionConfig.embeddingModel}
            onValueChange={(value) =>
              handleFieldChange((prev) => ({
                ...prev,
                embeddingModel: value,
              }))
            }
          >
            <SelectTrigger
              id="settings-embedding-model"
              aria-label="Embedding model selection"
              className="ai-field-sm w-full"
            />
            <SelectContent>
              {embeddingOptions.map((space) => (
                <SelectItem key={space.embeddingSpaceId} value={space.embeddingSpaceId}>
                  {space.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="settings-chat-engine">Chat Engine</Label>
          <Select
            value={sessionConfig.chatEngine}
            onValueChange={(value) =>
              handleFieldChange((prev) => ({
                ...prev,
                chatEngine: value,
              }))
            }
          >
            <SelectTrigger
              id="settings-chat-engine"
              aria-label="Chat engine selection"
              className="ai-field-sm w-full"
            />
            <SelectContent>
              {adminConfig.allowlist.chatEngines.map((engine) => (
                <SelectItem key={engine} value={engine}>
                  {ENGINE_LABELS[engine] ?? engine}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ai-settings-section__switches flex flex-wrap gap-3 mt-1.5">
          {adminConfig.allowlist.allowReverseRAG && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)] px-3 py-2">
              <p className="text-sm font-semibold text-[color:var(--ai-text-strong)]">
                Reverse RAG
              </p>
              <Switch
                className="flex-shrink-0"
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
          )}

          {adminConfig.allowlist.allowHyde && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)] px-3 py-2">
              <p className="text-sm font-semibold text-[color:var(--ai-text-strong)]">
                HyDE
              </p>
              <Switch
                className="flex-shrink-0"
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
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="settings-ranker">Ranker</Label>
          <Select
            value={sessionConfig.features.ranker}
            onValueChange={(value) =>
              handleFieldChange((prev) => ({
                ...prev,
                features: {
                  ...prev.features,
                  ranker: value,
                },
              }))
            }
          >
            <SelectTrigger
              id="settings-ranker"
              aria-label="Ranker selection"
              className="ai-field-sm w-full"
            />
            <SelectContent>
              {adminConfig.allowlist.rankers.map((ranker) => (
                <SelectItem key={ranker} value={ranker}>
                  {ranker.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
