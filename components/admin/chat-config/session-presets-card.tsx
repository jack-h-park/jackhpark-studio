import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { type Dispatch, Fragment, type ReactNode,type SetStateAction } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PromptWithCounter } from "@/components/ui/prompt-with-counter";
import { Radiobutton } from "@/components/ui/radiobutton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  presetDisplayNames,
  presetDisplayOrder,
  type PresetKey,
} from "@/hooks/use-admin-chat-config";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { CHAT_ENGINE_LABELS, type ChatEngine } from "@/lib/shared/model-provider";
import { type EmbeddingModelId, type LlmModelId, type RankerId } from "@/lib/shared/models";
import { type AdminChatConfig, type AdminChatRuntimeMeta, type SummaryLevel } from "@/types/chat-config";

const summaryLevelOptions: SummaryLevel[] = ["off", "low", "medium", "high"];
const EMBEDDING_MODEL_OPTIONS = listEmbeddingModelOptions();

export type SessionPresetsCardProps = {
  config: AdminChatConfig;
  numericLimits: AdminChatConfig["numericLimits"];
  presets: AdminChatConfig["presets"];
  contextHistoryEnabled: Record<PresetKey, boolean>;
  setContextHistoryEnabled: Dispatch<SetStateAction<Record<PresetKey, boolean>>>;
  updatePreset: (
    presetName: PresetKey,
    updater: (preset: AdminChatConfig["presets"][PresetKey]) => AdminChatConfig["presets"][PresetKey],
  ) => void;
  llmModelOptions: { id: string; label: string; requiresOllama: boolean }[];
  additionalPromptMaxLength: number;
  presetResolutions: AdminChatRuntimeMeta["presetResolutions"];
  ollamaEnabled: boolean;
  defaultLlmModelId: string;
};

export function SessionPresetsCard({
  config,
  numericLimits,
  presets,
  contextHistoryEnabled,
  setContextHistoryEnabled,
  updatePreset,
  llmModelOptions,
  additionalPromptMaxLength,
  presetResolutions,
  ollamaEnabled,
  defaultLlmModelId,
}: SessionPresetsCardProps) {
  const sessionGridLabelClass = "flex items-center text-[0.85rem] font-semibold text-[color:var(--ai-text-muted)]";
  const sessionGridValueClass = "flex flex-col gap-1";
  const sessionGridHeaderClass = "text-[0.75rem] font-semibold uppercase tracking-[0.25em] text-[color:var(--ai-text-strong)]";

  function PresetSettingsGroup({
    title,
    groupId,
    renderHeaderCell,
    children,
  }: {
    title: string;
    groupId: string;
    renderHeaderCell: (presetKey: PresetKey, headerLabelId: string) => ReactNode;
    children: ReactNode;
  }) {
    const headerLabelId = `${groupId}-label`;

    return (
      <Fragment key={`group-${groupId}`}>
        <div id={headerLabelId} className={sessionGridLabelClass}>
          {title}
        </div>
        {presetDisplayOrder.map((presetKey) => (
          <div key={`${groupId}-header-${presetKey}`} className={sessionGridValueClass}>
            {renderHeaderCell(presetKey, headerLabelId)}
          </div>
        ))}
        {children}
      </Fragment>
    );
  }

  const renderPresetRow = (
    label: string,
    renderCell: (presetKey: PresetKey) => React.ReactNode,
  ) => (
    <Fragment key={label}>
      <div className={sessionGridLabelClass}>{label}</div>
      {presetDisplayOrder.map((presetKey) => (
        <div key={`${label}-${presetKey}`} className={sessionGridValueClass}>
          {renderCell(presetKey)}
        </div>
      ))}
    </Fragment>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<FiLayers aria-hidden="true" />}>Session Presets</CardTitle>
        <CardDescription>Customize each preset so it stays within the allowed limits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <GridPanel className="gap-4 px-4 py-5 shadow-sm">
          <div className="grid grid-cols-[minmax(190px,1fr)_repeat(3,minmax(0,1fr))] gap-y-3 gap-x-4 items-start">
            <div className={`${sessionGridLabelClass} ${sessionGridHeaderClass}`}>Setting</div>
            {presetDisplayOrder.map((presetKey) => (
              <div key={`session-preset-header-${presetKey}`} className={sessionGridHeaderClass}>
                {presetDisplayNames[presetKey]}
              </div>
            ))}
            {renderPresetRow("Additional user system prompt", (presetKey) => {
              const preset = presets[presetKey];
              return (
                <PromptWithCounter
                  label="Additional user system prompt"
                  labelClassName="sr-only"
                  value={preset.additionalSystemPrompt ?? ""}
                  maxLength={additionalPromptMaxLength}
                  helperText={`User system prompt for this preset to be added to the base system prompt. Up to ${additionalPromptMaxLength} characters.`}
                  onChange={(value) =>
                    updatePreset(presetKey, (prev) => ({
                      ...prev,
                      additionalSystemPrompt: value,
                    }))
                  }
                />
              );
            })}
            {renderPresetRow("LLM Model", (presetKey) => {
              const resolution = presetResolutions[presetKey];
              const wasSubstituted = resolution?.wasSubstituted;
              const substitutionTooltip = wasSubstituted
                ? `This preset uses ${resolution.requestedModelId}, which is unavailable. It will run as ${resolution.resolvedModelId} at runtime.`
                : undefined;
              return (
                <div className="flex items-center gap-2">
                  <Select
                    value={presets[presetKey].llmModel}
                    onValueChange={(value) =>
                      updatePreset(presetKey, (prev) => ({
                        ...prev,
                        llmModel: value as LlmModelId,
                      }))
                    }
                  >
                    <SelectTrigger aria-label={`LLM Model for ${presetDisplayNames[presetKey]}`} />
                    <SelectContent>
                      {llmModelOptions.map((option) => {
                        const disabledByEnv = option.requiresOllama && !ollamaEnabled;
                        const optionTooltip = disabledByEnv
                          ? `Ollama is unavailable in this environment. Using ${defaultLlmModelId} instead.`
                          : undefined;
                        const label = (
                          <span className="inline-flex items-center gap-1">
                            {option.label}
                            {disabledByEnv && (
                              <FiAlertCircle
                                aria-hidden="true"
                                className="text-[color:var(--ai-text-muted)]"
                                size={14}
                                title={optionTooltip}
                              />
                            )}
                          </span>
                        );
                        return (
                          <SelectItem
                            key={option.id}
                            value={option.id}
                            disabled={!config.allowlist.llmModels.includes(option.id) || disabledByEnv}
                          >
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {wasSubstituted && (
                    <FiAlertCircle
                      aria-hidden="true"
                      className="text-[color:var(--ai-text-muted)]"
                      size={14}
                      title={substitutionTooltip}
                    />
                  )}
                </div>
              );
            })}
            {renderPresetRow("Embedding Model", (presetKey) => (
              <Select
                value={presets[presetKey].embeddingModel}
                onValueChange={(value) =>
                  updatePreset(presetKey, (prev) => ({
                    ...prev,
                    embeddingModel: value,
                  }))
                }
              >
                <SelectTrigger aria-label={`Embedding Model for ${presetDisplayNames[presetKey]}`} />
                <SelectContent>
                  {EMBEDDING_MODEL_OPTIONS.map((space) => (
                    <SelectItem
                      key={space.embeddingSpaceId}
                      value={space.embeddingSpaceId}
                      disabled={!config.allowlist.embeddingModels.includes(space.embeddingSpaceId as EmbeddingModelId)}
                    >
                      {space.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            {renderPresetRow("Chat Engine", (presetKey) => (
              <Select
                value={presets[presetKey].chatEngine}
                onValueChange={(value) =>
                  updatePreset(presetKey, (prev) => ({
                    ...prev,
                    chatEngine: value as ChatEngine,
                  }))
                }
              >
                <SelectTrigger aria-label={`Chat Engine for ${presetDisplayNames[presetKey]}`} />
                <SelectContent>
                  {config.allowlist.chatEngines.map((engine) => (
                    <SelectItem key={engine} value={engine}>
                      {CHAT_ENGINE_LABELS[engine] ?? engine}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            <PresetSettingsGroup
              title="Retrieval (RAG)"
              groupId="retrieval-rag"
              renderHeaderCell={(presetKey, headerLabelId) => {
                const preset = presets[presetKey];
                const toggleLabelId = `${headerLabelId}-toggle-${presetKey}`;
                return (
                  <div className="inline-flex items-center gap-2">
                    <span className="sr-only" id={toggleLabelId}>
                      Toggle Retrieval (RAG) for {presetDisplayNames[presetKey]}
                    </span>
                    <Switch
                      className="flex-shrink-0"
                      aria-labelledby={`${headerLabelId} ${toggleLabelId}`}
                      checked={preset.rag.enabled}
                      onCheckedChange={(checked) =>
                        updatePreset(presetKey, (prev) => ({
                          ...prev,
                          rag: {
                            ...prev.rag,
                            enabled: checked,
                          },
                        }))
                      }
                    />
                    <div className="ai-choice">
                      <span className="ai-choice__label">Enabled</span>
                    </div>
                  </div>
                );
              }}
            >
              {renderPresetRow("RAG Top K", (presetKey) => (
                <Input
                  type="number"
                  min={numericLimits.ragTopK.min}
                  max={numericLimits.ragTopK.max}
                  aria-label={`RAG Top K for ${presetDisplayNames[presetKey]}`}
                  value={presets[presetKey].rag.topK}
                  disabled={!presets[presetKey].rag.enabled}
                  onChange={(event) =>
                    updatePreset(presetKey, (prev) => ({
                      ...prev,
                      rag: {
                        ...prev.rag,
                        topK: Number(event.target.value) || 0,
                      },
                    }))
                  }
                />
              ))}
              {renderPresetRow("Similarity", (presetKey) => (
                <Input
                  type="number"
                  step={0.01}
                  min={numericLimits.similarityThreshold.min}
                  max={numericLimits.similarityThreshold.max}
                  aria-label={`Similarity for ${presetDisplayNames[presetKey]}`}
                  value={presets[presetKey].rag.similarity}
                  disabled={!presets[presetKey].rag.enabled}
                  onChange={(event) =>
                    updatePreset(presetKey, (prev) => ({
                      ...prev,
                      rag: {
                        ...prev.rag,
                        similarity: Number(event.target.value) || 0,
                      },
                    }))
                  }
                />
              ))}
              {renderPresetRow("Reverse RAG", (presetKey) => {
                const preset = presets[presetKey];
                const ragDisabled = !preset.rag.enabled;
                return (
                  <div className="inline-flex items-center gap-2 text-sm">
                    <Switch
                      className="shrink-0"
                      aria-label={`Reverse RAG for ${presetDisplayNames[presetKey]}`}
                      checked={config.allowlist.allowReverseRAG ? preset.features.reverseRAG : false}
                      disabled={!config.allowlist.allowReverseRAG || ragDisabled}
                      onCheckedChange={(checked) =>
                        updatePreset(presetKey, (prev) => ({
                          ...prev,
                          features: {
                            ...prev.features,
                            reverseRAG: checked,
                          },
                        }))
                      }
                    />
                    <span>Enabled</span>
                  </div>
                );
              })}
              {renderPresetRow("HyDE", (presetKey) => {
                const preset = presets[presetKey];
                const ragDisabled = !preset.rag.enabled;
                return (
                  <div className="inline-flex items-center gap-2 text-sm">
                    <Switch
                      className="shrink-0"
                      aria-label={`HyDE for ${presetDisplayNames[presetKey]}`}
                      checked={config.allowlist.allowHyde ? preset.features.hyde : false}
                      disabled={!config.allowlist.allowHyde || ragDisabled}
                      onCheckedChange={(checked) =>
                        updatePreset(presetKey, (prev) => ({
                          ...prev,
                          features: {
                            ...prev.features,
                            hyde: checked,
                          },
                        }))
                      }
                    />
                    <span>Enabled</span>
                  </div>
                );
              })}
              {renderPresetRow("Ranker", (presetKey) => (
                <Select
                  value={presets[presetKey].features.ranker}
                  disabled={!presets[presetKey].rag.enabled}
                  onValueChange={(value) =>
                    updatePreset(presetKey, (prev) => ({
                      ...prev,
                      features: {
                        ...prev.features,
                        ranker: value as RankerId,
                      },
                    }))
                  }
                >
                  <SelectTrigger aria-label={`Ranker for ${presetDisplayNames[presetKey]}`} />
                  <SelectContent>
                    {config.allowlist.rankers.map((ranker) => (
                      <SelectItem key={ranker} value={ranker}>
                        {ranker}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
              {renderPresetRow("Summary Level", (presetKey) => (
                <div className="flex flex-wrap gap-2 text-sm">
                  {summaryLevelOptions.map((level) => (
                    <Radiobutton
                      key={level}
                      variant="chip"
                      name={`${presetKey}-summary`}
                      value={level}
                      label={level}
                      checked={presets[presetKey].summaryLevel === level}
                      disabled={!presets[presetKey].rag.enabled}
                      onChange={() =>
                        updatePreset(presetKey, (prev) => ({
                          ...prev,
                          summaryLevel: level,
                        }))
                      }
                    />
                  ))}
                </div>
              ))}
            </PresetSettingsGroup>
            <PresetSettingsGroup
              title="Context & History"
              groupId="context-history"
              renderHeaderCell={(presetKey, headerLabelId) => {
                const toggleLabelId = `${headerLabelId}-toggle-${presetKey}`;
                const isEnabled = contextHistoryEnabled[presetKey] ?? true;
                return (
                  <div className="inline-flex items-center gap-2">
                    <span className="sr-only" id={toggleLabelId}>
                      Toggle Context & History editing for {presetDisplayNames[presetKey]}
                    </span>
                    <Switch
                      className="flex-shrink-0"
                      checked={isEnabled}
                      aria-labelledby={`${headerLabelId} ${toggleLabelId}`}
                      onCheckedChange={(checked) =>
                        setContextHistoryEnabled((prev) => ({
                          ...prev,
                          [presetKey]: checked,
                        }))
                      }
                    />
                    <div className="ai-choice">
                      <span className="ai-choice__label">Enabled</span>
                    </div>
                  </div>
                );
              }}
            >
              {renderPresetRow("Token Budget", (presetKey) => {
                const fieldEnabled = contextHistoryEnabled[presetKey] ?? true;
                return (
                  <Input
                    type="number"
                    min={numericLimits.contextBudget.min}
                    max={numericLimits.contextBudget.max}
                    aria-label={`Token Budget for ${presetDisplayNames[presetKey]}`}
                    value={presets[presetKey].context.tokenBudget}
                    disabled={!fieldEnabled}
                    onChange={(event) =>
                      updatePreset(presetKey, (prev) => ({
                        ...prev,
                        context: {
                          ...prev.context,
                          tokenBudget: Number(event.target.value) || 0,
                        },
                      }))
                    }
                  />
                );
              })}
              {renderPresetRow("History Budget", (presetKey) => {
                const fieldEnabled = contextHistoryEnabled[presetKey] ?? true;
                return (
                  <Input
                    type="number"
                    min={numericLimits.historyBudget.min}
                    max={numericLimits.historyBudget.max}
                    aria-label={`History Budget for ${presetDisplayNames[presetKey]}`}
                    value={presets[presetKey].context.historyBudget}
                    disabled={!fieldEnabled}
                    onChange={(event) =>
                      updatePreset(presetKey, (prev) => ({
                        ...prev,
                        context: {
                          ...prev.context,
                          historyBudget: Number(event.target.value) || 0,
                        },
                      }))
                    }
                  />
                );
              })}
              {renderPresetRow("Clip Tokens", (presetKey) => {
                const fieldEnabled = contextHistoryEnabled[presetKey] ?? true;
                return (
                  <Input
                    type="number"
                    min={numericLimits.clipTokens.min}
                    max={numericLimits.clipTokens.max}
                    aria-label={`Clip Tokens for ${presetDisplayNames[presetKey]}`}
                    value={presets[presetKey].context.clipTokens}
                    disabled={!fieldEnabled}
                    onChange={(event) =>
                      updatePreset(presetKey, (prev) => ({
                        ...prev,
                        context: {
                          ...prev.context,
                          clipTokens: Number(event.target.value) || 0,
                        },
                      }))
                    }
                  />
                );
              })}
            </PresetSettingsGroup>
          </div>
        </GridPanel>
      </CardContent>
    </Card>
  );
}
