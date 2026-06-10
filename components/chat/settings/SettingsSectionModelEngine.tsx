"use client";

import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiCpu } from "@react-icons/all-files/fi/FiCpu";
import { useMemo } from "react";

import type { EmbeddingModelId } from "@/lib/shared/models";
import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { SelectField } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { isSettingLocked } from "@/lib/shared/chat-settings-policy";

import { LockedByPresetNotice, ManagedByPresetBadge } from "./LockedByPreset";
import { createSessionOverrideUpdater } from "./preset-overrides";

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
  const isEmbeddingLocked = isSettingLocked("embeddingModel");
  const embeddingOptions = useMemo(() => {
    const allowlist = new Set(adminConfig.allowlist.embeddingModels);
    const availableSpaces = listEmbeddingModelOptions();
    const filtered = availableSpaces.filter((space) =>
      allowlist.has(space.embeddingSpaceId),
    );
    return filtered.length > 0 ? filtered : availableSpaces;
  }, [adminConfig.allowlist.embeddingModels]);

  const handleFieldChange = createSessionOverrideUpdater(setSessionConfig);

  return (
    <Section>
      <SectionHeader>
        <SectionTitle as="p" icon={<FiCpu aria-hidden="true" />}>
          Model &amp; Engine
        </SectionTitle>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        <div className="ai-field">
          <Label
            htmlFor="settings-embedding-model"
            className="ai-field__label flex items-center gap-2"
          >
            Embedding Model
            {isEmbeddingLocked && <ManagedByPresetBadge />}
          </Label>
          {isEmbeddingLocked ? (
            <LockedByPresetNotice>
              Embedding model selection is managed by the preset (see Preset
              Effects summary above).
            </LockedByPresetNotice>
          ) : (
            <SelectField
              id="settings-embedding-model"
              ariaLabel="Embedding model selection"
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
              options={embeddingOptions.map((space) => ({
                value: space.embeddingSpaceId,
                label: space.label,
              }))}
            />
          )}
          {sessionConfig.embeddingSpaceId &&
            EMBEDDING_SPACE_WARNINGS[sessionConfig.embeddingSpaceId] && (
              <div className="ai-warning-callout mt-2">
                <FiAlertCircle
                  aria-hidden="true"
                  className="ai-icon"
                  size={16}
                />
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Embedding space warning</span>
                  <span className="opacity-90">
                    {EMBEDDING_SPACE_WARNINGS[sessionConfig.embeddingSpaceId]}
                  </span>
                </div>
              </div>
            )}
        </div>
      </SectionContent>
    </Section>
  );
}
