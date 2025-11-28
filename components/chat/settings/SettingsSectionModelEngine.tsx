"use client";

import { FiCpu } from "@react-icons/all-files/fi/FiCpu";
import { useMemo } from "react";

import type { EmbeddingModelId, LlmModelId } from "@/lib/shared/models";
import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { listLlmModelOptions } from "@/lib/core/llm-registry";
import {
  CHAT_ENGINE_LABELS,
  type ChatEngine,
} from "@/lib/shared/model-provider";

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
      allowlist.has(option.id as LlmModelId),
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
                llmModel: value as LlmModelId,
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
                embeddingModel: value as EmbeddingModelId,
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
                <SelectItem
                  key={space.embeddingSpaceId}
                  value={space.embeddingSpaceId}
                >
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
                chatEngine: value as ChatEngine,
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
                  {CHAT_ENGINE_LABELS[engine] ?? engine}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      </div>
    </section>
  );
}
