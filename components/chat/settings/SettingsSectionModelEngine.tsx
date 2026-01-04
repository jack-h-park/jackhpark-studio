"use client";

import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiCpu } from "@react-icons/all-files/fi/FiCpu";
import { useMemo } from "react";

import type { EmbeddingModelId, LlmModelId } from "@/lib/shared/models";
import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { Label } from "@/components/ui/label";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { listAllLlmModelOptions } from "@/lib/core/llm-registry";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: ChatConfigSetter;
};

type ChatConfigSetter = (
  value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
) => void;

const EMBEDDING_SPACE_WARNINGS: Record<string, string> = {
  gemini_te4_v1:
    "Selected embedding space has no indexed chunks; retrieval will return empty context.",
};

export function SettingsSectionModelEngine({
  adminConfig,
  sessionConfig,
  setSessionConfig,
}: Props) {
  const { runtimeMeta } = useChatConfig();
  const llmOptions = useMemo(() => {
    const allowlist = new Set(adminConfig.allowlist.llmModels);
    // Use listAllLlmModelOptions to get all definitions, then filter by client-side runtimeMeta
    const allOptions = listAllLlmModelOptions();
    const availableOptions = allOptions.filter((option) => {
      if (!option.isLocal) return true;
      if (option.provider === "ollama") return runtimeMeta.ollamaConfigured;
      if (option.provider === "lmstudio") return runtimeMeta.lmstudioConfigured;
      return true;
    });

    const filtered = availableOptions.filter((option) =>
      allowlist.has(option.id as LlmModelId),
    );
    return filtered.length > 0 ? filtered : availableOptions;
  }, [
    adminConfig.allowlist.llmModels,
    runtimeMeta.ollamaConfigured,
    runtimeMeta.lmstudioConfigured,
  ]);

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
    <Section>
      <SectionHeader>
        <SectionTitle as="p" icon={<FiCpu aria-hidden="true" />}>
          Model &amp; Engine
        </SectionTitle>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        <div className="ai-field">
          <Label htmlFor="settings-llm-model" className="ai-field__label">
            LLM Model
          </Label>
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
          {sessionConfig.llmModelResolution?.wasSubstituted && (
            <div className="ai-warning-callout mt-2">
              <FiAlertCircle aria-hidden="true" className="ai-icon" size={16} />
              <div className="flex flex-col gap-1">
                <span className="font-medium">Model substituted</span>
                <span className="opacity-90">
                  Requested{" "}
                  <strong>
                    {sessionConfig.llmModelResolution.requestedModelId}
                  </strong>{" "}
                  but using{" "}
                  <strong>
                    {sessionConfig.llmModelResolution.resolvedModelId}
                  </strong>{" "}
                  instead.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="ai-field">
          <Label htmlFor="settings-embedding-model" className="ai-field__label">
            Embedding Model
          </Label>
          <Select
            value={sessionConfig.embeddingModel}
            onValueChange={(value) => {
              const selectedSpace = embeddingOptions.find(
                (space) => space.embeddingSpaceId === value,
              );
              handleFieldChange((prev) => ({
                ...prev,
                embeddingModel: value as EmbeddingModelId,
                embeddingSpaceId: value,
                embeddingProvider:
                  selectedSpace?.provider ?? prev.embeddingProvider,
                embeddingModelId:
                  selectedSpace?.embeddingModelId ?? prev.embeddingModelId,
              }));
            }}
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
          {sessionConfig.embeddingSpaceId &&
            EMBEDDING_SPACE_WARNINGS[sessionConfig.embeddingSpaceId] && (
              <div className="ai-warning-callout mt-2">
                <FiAlertCircle aria-hidden="true" className="ai-icon" size={16} />
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Embedding space warning</span>
                  <span className="opacity-90">
                    {
                      EMBEDDING_SPACE_WARNINGS[
                        sessionConfig.embeddingSpaceId
                      ]
                    }
                  </span>
                </div>
              </div>
            )}
        </div>
      </SectionContent>
    </Section>
  );
}
