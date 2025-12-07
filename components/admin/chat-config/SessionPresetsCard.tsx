import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import {
  type Dispatch,
  Fragment,
  type SetStateAction,
} from "react";

import type { LocalLlmBackend } from "@/lib/local-llm/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";
import { PromptWithCounter } from "@/components/ui/prompt-with-counter";
import { Radiobutton } from "@/components/ui/radiobutton";
import { Section, SectionContent, SectionHeader, SectionTitle } from "@/components/ui/section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
 type AdminLlmModelOption,  presetDisplayNames,
  presetDisplayOrder,
  type PresetKey } from "@/hooks/use-admin-chat-config";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { normalizeLlmModelId } from "@/lib/core/llm-registry";
import {
  CHAT_ENGINE_LABELS,
  type ChatEngine,
} from "@/lib/shared/model-provider";
import {
  type EmbeddingModelId,
  type LlmModelId,
  type RankerId,
} from "@/lib/shared/models";
import {
  type AdminChatConfig,
  type AdminChatRuntimeMeta,
  type SummaryLevel,
} from "@/types/chat-config";

const summaryLevelOptions: SummaryLevel[] = ["off", "low", "medium", "high"];
const EMBEDDING_MODEL_OPTIONS = listEmbeddingModelOptions();

const SECTION_FIELD_LABEL_CLASS =
  "ai-label-overline ai-label-overline--small ai-label-overline--muted";

type RetrievalSectionProps = {
  presetKey: PresetKey;
  preset: AdminChatConfig["presets"][PresetKey];
  ragEnabled: boolean;
  displayName: string;
  numericLimits: AdminChatConfig["numericLimits"];
  allowlist: AdminChatConfig["allowlist"];
  summaryLevelOptions: SummaryLevel[];
  onToggleEnabled: (checked: boolean) => void;
  onTopKChange: (value: number) => void;
  onSimilarityChange: (value: number) => void;
  onReverseChange: (checked: boolean) => void;
  onHydeChange: (checked: boolean) => void;
  onRankerChange: (value: string) => void;
  onSummaryLevelChange: (level: SummaryLevel) => void;
};

function RetrievalSection({
  presetKey,
  preset,
  ragEnabled,
  displayName,
  numericLimits,
  allowlist,
  summaryLevelOptions,
  onToggleEnabled,
  onTopKChange,
  onSimilarityChange,
  onReverseChange,
  onHydeChange,
  onRankerChange,
  onSummaryLevelChange,
}: RetrievalSectionProps) {
  const ragDisabled = !ragEnabled;
  const reverseDisabled = ragDisabled || !allowlist.allowReverseRAG;
  const hydeDisabled = ragDisabled || !allowlist.allowHyde;

  return (
    <Section className="w-full" aria-disabled={ragDisabled} data-disabled={ragDisabled}>
      <SectionHeader className="items-center justify-between">
        <SectionTitle as="h3" className="text-sm">
          Enabled
        </SectionTitle>
        <Switch
          className="flex-shrink-0"
          aria-label={`Enable Retrieval (RAG) for ${displayName}`}
          checked={ragEnabled}
          onCheckedChange={onToggleEnabled}
        />
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className={SECTION_FIELD_LABEL_CLASS}>RAG Top K</span>
          <Input
            type="number"
            min={numericLimits.ragTopK.min}
            max={numericLimits.ragTopK.max}
            aria-label={`RAG Top K for ${displayName}`}
            value={preset.rag.topK}
            disabled={ragDisabled}
            onChange={(event) =>
              onTopKChange(Number(event.target.value))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={SECTION_FIELD_LABEL_CLASS}>Similarity</span>
          <Input
            type="number"
            step={0.01}
            min={numericLimits.similarityThreshold.min}
            max={numericLimits.similarityThreshold.max}
            aria-label={`Similarity for ${displayName}`}
            value={preset.rag.similarity}
            disabled={ragDisabled}
            onChange={(event) =>
              onSimilarityChange(Number(event.target.value))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <CheckboxChoice
            label="Reverse RAG"
            layout="inline"
            checked={
              allowlist.allowReverseRAG ? preset.features.reverseRAG : false
            }
            disabled={reverseDisabled}
            onCheckedChange={onReverseChange}
          />
        </div>
        <div className="flex flex-col gap-1">
          <CheckboxChoice
            label="HyDE"
            layout="inline"
            checked={allowlist.allowHyde ? preset.features.hyde : false}
            disabled={hydeDisabled}
            onCheckedChange={onHydeChange}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={SECTION_FIELD_LABEL_CLASS}>Ranker</span>
          <Select
            value={preset.features.ranker}
            disabled={ragDisabled}
            onValueChange={onRankerChange}
          >
            <SelectTrigger
              aria-label={`Ranker for ${displayName}`}
            />
            <SelectContent>
              {allowlist.rankers.map((ranker) => (
                <SelectItem key={ranker} value={ranker}>
                  {ranker}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <span className={SECTION_FIELD_LABEL_CLASS}>Summary Level</span>
          <div className="flex flex-wrap gap-2 text-sm">
            {summaryLevelOptions.map((level) => (
              <Radiobutton
                key={level}
                variant="chip"
                name={`${presetKey}-summary`}
                value={level}
                label={level}
                checked={preset.summaryLevel === level}
                disabled={ragDisabled}
                onChange={() => onSummaryLevelChange(level)}
              />
            ))}
          </div>
        </div>
      </SectionContent>
    </Section>
  );
}

export type SessionPresetsCardProps = {
  config: AdminChatConfig;
  numericLimits: AdminChatConfig["numericLimits"];
  presets: AdminChatConfig["presets"];
  contextHistoryEnabled: Record<PresetKey, boolean>;
  setContextHistoryEnabled: Dispatch<
    SetStateAction<Record<PresetKey, boolean>>
  >;
  updatePreset: (
    presetName: PresetKey,
    updater: (
      preset: AdminChatConfig["presets"][PresetKey],
    ) => AdminChatConfig["presets"][PresetKey],
  ) => void;
  llmModelOptions: AdminLlmModelOption[];
  additionalPromptMaxLength: number;
  presetResolutions: AdminChatRuntimeMeta["presetResolutions"];
  ollamaEnabled: boolean;
  lmstudioEnabled: boolean;
  localLlmBackendEnv: LocalLlmBackend | null;
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
  lmstudioEnabled,
  localLlmBackendEnv,
  defaultLlmModelId,
}: SessionPresetsCardProps) {
  const normalizedAllowlistIds = config.allowlist.llmModels
    .map((id) => normalizeLlmModelId(id) ?? id)
    .filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
  const normalizedAllowlistSet = new Set(normalizedAllowlistIds);
  const sessionGridLabelClass =
    "flex items-center ai-label-overline ai-label-overline--muted";
  const sessionGridValueClass = "flex flex-col gap-1";
  const sessionGridHeaderClass =
    "ai-label-overline ai-label-overline--small";
  const handleAdditionalSystemPromptChange = (
    presetKey: PresetKey,
    value: string,
  ) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      additionalSystemPrompt: value,
    }));
  };

  const handlePresetLlmModelChange = (presetKey: PresetKey, value: string) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      llmModel: value as LlmModelId,
    }));
  };

  const handleRequireLocalChange = (presetKey: PresetKey, checked: boolean) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      requireLocal: checked,
    }));
  };

  const handleRagEnabledChange = (presetKey: PresetKey, enabled: boolean) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      rag: {
        ...prev.rag,
        enabled,
      },
    }));
  };

  const handleRagTopKChange = (presetKey: PresetKey, nextValue: number) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      rag: {
        ...prev.rag,
        topK: nextValue || 0,
      },
    }));
  };

  const handleRagSimilarityChange = (presetKey: PresetKey, nextValue: number) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      rag: {
        ...prev.rag,
        similarity: nextValue || 0,
      },
    }));
  };

  const handleReverseRagChange = (presetKey: PresetKey, checked: boolean) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      features: {
        ...prev.features,
        reverseRAG: checked,
      },
    }));
  };

  const handleHydeChange = (presetKey: PresetKey, checked: boolean) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      features: {
        ...prev.features,
        hyde: checked,
      },
    }));
  };

  const handleRankerChange = (presetKey: PresetKey, value: string) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      features: {
        ...prev.features,
        ranker: value as RankerId,
      },
    }));
  };

  const handleSummaryLevelChange = (presetKey: PresetKey, level: SummaryLevel) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      summaryLevel: level,
    }));
  };

  const handleContextHistoryToggle = (presetKey: PresetKey, checked: boolean) => {
    setContextHistoryEnabled((prev) => ({
      ...prev,
      [presetKey]: checked,
    }));
  };

  const handleTokenBudgetChange = (
    presetKey: PresetKey,
    nextValue: number,
  ) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      context: {
        ...prev.context,
        tokenBudget: nextValue || 0,
      },
    }));
  };

  const handleHistoryBudgetChange = (
    presetKey: PresetKey,
    nextValue: number,
  ) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      context: {
        ...prev.context,
        historyBudget: nextValue || 0,
      },
    }));
  };

  const handleClipTokensChange = (
    presetKey: PresetKey,
    nextValue: number,
  ) => {
    updatePreset(presetKey, (prev) => ({
      ...prev,
      context: {
        ...prev.context,
        clipTokens: nextValue || 0,
      },
    }));
  };

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

  const renderRagSection = (presetKey: PresetKey) => {
    const preset = presets[presetKey];
    return (
      <RetrievalSection
        presetKey={presetKey}
        preset={preset}
        ragEnabled={preset.rag.enabled}
        displayName={presetDisplayNames[presetKey]}
        numericLimits={numericLimits}
        allowlist={config.allowlist}
        summaryLevelOptions={summaryLevelOptions}
        onToggleEnabled={(checked) =>
          handleRagEnabledChange(presetKey, checked)
        }
        onTopKChange={(value) => handleRagTopKChange(presetKey, value)}
        onSimilarityChange={(value) =>
          handleRagSimilarityChange(presetKey, value)
        }
        onReverseChange={(checked) =>
          handleReverseRagChange(presetKey, checked)
        }
        onHydeChange={(checked) => handleHydeChange(presetKey, checked)}
        onRankerChange={(value) => handleRankerChange(presetKey, value)}
        onSummaryLevelChange={(level) =>
          handleSummaryLevelChange(presetKey, level)
        }
      />
    );
  };

  const renderContextSection = (presetKey: PresetKey) => {
    const isEnabled = contextHistoryEnabled[presetKey] ?? true;
    const isDisabled = !isEnabled;
    return (
    <Section className="w-full" aria-disabled={isDisabled} data-disabled={isDisabled}>
      <SectionHeader className="items-center justify-between">
        <SectionTitle as="h3" className="text-sm">
          Enabled
        </SectionTitle>
        <Switch
          className="flex-shrink-0"
          aria-label={`Enable Context & History for ${presetDisplayNames[presetKey]}`}
          checked={isEnabled}
          onCheckedChange={(checked) =>
            handleContextHistoryToggle(presetKey, checked)
          }
        />
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className={SECTION_FIELD_LABEL_CLASS}>Token Budget</span>
            <Input
              type="number"
              min={numericLimits.contextBudget.min}
              max={numericLimits.contextBudget.max}
              aria-label={`Token Budget for ${presetDisplayNames[presetKey]}`}
              value={presets[presetKey].context.tokenBudget}
              disabled={isDisabled}
              onChange={(event) =>
                handleTokenBudgetChange(
                  presetKey,
                  Number(event.target.value),
                )
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={SECTION_FIELD_LABEL_CLASS}>History Budget</span>
            <Input
              type="number"
              min={numericLimits.historyBudget.min}
              max={numericLimits.historyBudget.max}
              aria-label={`History Budget for ${presetDisplayNames[presetKey]}`}
              value={presets[presetKey].context.historyBudget}
              disabled={isDisabled}
              onChange={(event) =>
                handleHistoryBudgetChange(
                  presetKey,
                  Number(event.target.value),
                )
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={SECTION_FIELD_LABEL_CLASS}>Clip Tokens</span>
            <Input
              type="number"
              min={numericLimits.clipTokens.min}
              max={numericLimits.clipTokens.max}
              aria-label={`Clip Tokens for ${presetDisplayNames[presetKey]}`}
              value={presets[presetKey].context.clipTokens}
              disabled={isDisabled}
              onChange={(event) =>
                handleClipTokensChange(
                  presetKey,
                  Number(event.target.value),
                )
              }
            />
          </div>
        </SectionContent>
      </Section>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<FiLayers aria-hidden="true" />}>
          Session Presets
        </CardTitle>
        <CardDescription>
          Customize each preset so it stays within the allowed limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <GridPanel className="gap-4 px-4 py-5 shadow-sm">
          <div className="grid grid-cols-[minmax(190px,1fr)_repeat(3,minmax(0,1fr))] gap-y-3 gap-x-4 items-start">
            <div
              className={`${sessionGridLabelClass} ${sessionGridHeaderClass}`}
            >
              Setting
            </div>
            {presetDisplayOrder.map((presetKey) => (
              <div
                key={`session-preset-header-${presetKey}`}
                className={sessionGridHeaderClass}
              >
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
                    handleAdditionalSystemPromptChange(presetKey, value)
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
                      handlePresetLlmModelChange(presetKey, value)
                    }
                  >
                    <SelectTrigger
                      aria-label={`LLM Model for ${presetDisplayNames[presetKey]}`}
                    />
                    <SelectContent>
                      {llmModelOptions.map((option) => {
                        const localProvider = option.isLocal
                          ? option.provider
                          : undefined;
                        const backendLabel =
                          localProvider === "lmstudio"
                            ? "LM Studio"
                            : localProvider === "ollama"
                              ? "Ollama"
                              : undefined;
                        const backendEnabled =
                          localProvider === "ollama"
                            ? ollamaEnabled
                            : localProvider === "lmstudio"
                              ? lmstudioEnabled
                              : true;
                        const disabledByEnv =
                          Boolean(localProvider) && !backendEnabled;
                        const optionTooltip = disabledByEnv
                          ? `${backendLabel ?? "Local backend"} is unavailable in this environment. Using ${defaultLlmModelId} instead.`
                          : undefined;
                        const label = (
                          <span className="inline-flex items-center gap-1">
                            {option.label}
                            {optionTooltip && (
                              <FiAlertCircle
                                aria-hidden="true"
                                className="text-[color:var(--ai-text-muted)]"
                                size={14}
                                title={optionTooltip}
                              />
                            )}
                          </span>
                        );
                        const optionAllowed = normalizedAllowlistSet.has(option.id);
                        return (
                          <SelectItem
                            key={option.id}
                            value={option.id}
                            title={option.subtitle ?? option.id}
                            disabled={!optionAllowed || disabledByEnv}
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
                <SelectTrigger
                  aria-label={`Embedding Model for ${presetDisplayNames[presetKey]}`}
                />
                <SelectContent>
                  {EMBEDDING_MODEL_OPTIONS.map((space) => (
                    <SelectItem
                      key={space.embeddingSpaceId}
                      value={space.embeddingSpaceId}
                      disabled={
                        !config.allowlist.embeddingModels.includes(
                          space.embeddingSpaceId as EmbeddingModelId,
                        )
                      }
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
                <SelectTrigger
                  aria-label={`Chat Engine for ${presetDisplayNames[presetKey]}`}
                />
                <SelectContent>
                  {config.allowlist.chatEngines.map((engine) => (
                    <SelectItem key={engine} value={engine}>
                      {CHAT_ENGINE_LABELS[engine] ?? engine}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            {renderPresetRow("Require local backend", (presetKey) => {
              const preset = presets[presetKey];
              const modelOption = llmModelOptions.find(
                (option) => option.id === preset.llmModel,
              );
              const isLocalModel = modelOption?.isLocal;
              const localBackend =
                modelOption?.localBackend ??
                (isLocalModel ? modelOption?.provider : undefined);
              const baseDescription =
                "If enabled, this preset can only run on local LLM engines.";
              const cloudWarning =
                preset.requireLocal && !isLocalModel
                  ? "This model is cloud-only. With “Require local backend” enabled, it will always fail."
                  : null;
              const mismatchWarning =
                preset.requireLocal &&
                isLocalModel &&
                localBackend &&
                localLlmBackendEnv &&
                localBackend !== localLlmBackendEnv
                  ? "LOCAL_LLM_BACKEND does not match this model’s backend. This preset may fail at runtime."
                  : null;
              return (
                <CheckboxChoice
                  label="Require local backend"
                  description={
                    <span className="flex flex-col gap-1">
                      <span className="ai-helper-text">{baseDescription}</span>
                      {cloudWarning && (
                        <span className="text-[color:var(--ai-error)] text-sm">
                          {cloudWarning}
                        </span>
                      )}
                      {mismatchWarning && (
                        <span className="text-[color:var(--ai-text-muted)] text-sm">
                          {mismatchWarning}
                        </span>
                      )}
                    </span>
                  }
                  layout="stacked"
                  checked={Boolean(preset.requireLocal)}
                  onCheckedChange={(checked) =>
                    handleRequireLocalChange(presetKey, Boolean(checked))
                  }
                  disabled={!isLocalModel}
                />
              );
            })}
            <div className={sessionGridLabelClass}>Retrieval (RAG)</div>
            {presetDisplayOrder.map((presetKey) => (
              <div
                key={`retrieval-section-${presetKey}`}
                className={sessionGridValueClass}
              >
                {renderRagSection(presetKey)}
              </div>
            ))}
            <div className={sessionGridLabelClass}>Context & History</div>
            {presetDisplayOrder.map((presetKey) => (
              <div
                key={`context-section-${presetKey}`}
                className={sessionGridValueClass}
              >
                {renderContextSection(presetKey)}
              </div>
            ))}
          </div>
        </GridPanel>
      </CardContent>
    </Card>
  );
}
