import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AdminChatConfig,
  AdminNumericLimit,
  SessionChatConfigPreset,
  SummaryLevel,
} from "@/types/chat-config";
import { AiPageChrome } from "@/components/AiPageChrome";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminChatConfig,
  getAdminChatConfigMetadata,
} from "@/lib/server/admin-chat-config";
import {
  loadNotionNavigationHeader,
  type NotionNavigationHeader,
} from "@/lib/server/notion-header";

type PageProps = {
  adminConfig: AdminChatConfig;
  lastUpdatedAt: string | null;
} & NotionNavigationHeader;

type SaveStatus = "idle" | "saving" | "success" | "error";
type SaveConfigResponse = {
  updatedAt?: string | null;
  error?: string;
};

const numericLimitLabels: Record<
  keyof AdminChatConfig["numericLimits"],
  string
> = {
  ragTopK: "RAG Top K",
  similarityThreshold: "Similarity Threshold",
  contextBudget: "Context Token Budget",
  historyBudget: "History Budget",
  clipTokens: "Clip Tokens",
};

const allowlistArrayFields: Array<
  Exclude<keyof AdminChatConfig["allowlist"], "allowReverseRAG" | "allowHyde">
> = ["chatEngines", "llmModels", "embeddingModels", "rankers"];

const allowlistFieldLabels: Record<
  typeof allowlistArrayFields[number],
  string
> = {
  chatEngines: "Chat Engines",
  llmModels: "LLM Models",
  embeddingModels: "Embedding Models",
  rankers: "Rankers",
};

const summaryLevelOptions: SummaryLevel[] = ["off", "low", "medium", "high"];

type PresetKey = keyof AdminChatConfig["presets"];

function arrayToText(list: string[]) {
  return list.join("\n");
}

function textToArray(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function AdminChatConfigForm({
  adminConfig,
  lastUpdatedAt,
}: Pick<PageProps, "adminConfig" | "lastUpdatedAt">) {
  const [config, setConfig] = useState<AdminChatConfig>(() => ({
    ...adminConfig,
  }));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(lastUpdatedAt);
  const [isRawModalOpen, setIsRawModalOpen] = useState(false);

  useEffect(() => {
    setConfig(adminConfig);
  }, [adminConfig]);

  const updateConfig = useCallback(
    (updater: (prev: AdminChatConfig) => AdminChatConfig) => {
      setConfig((prev) => updater(prev));
    },
    [],
  );

  const numericLimitErrors = useMemo(() => {
    const errors: string[] = [];
    for (const [key, limit] of Object.entries(config.numericLimits)) {
      const parsedKey = key as keyof AdminChatConfig["numericLimits"];
      if (limit.min > limit.max) {
        errors.push(`${numericLimitLabels[parsedKey]} min must be ≤ max.`);
        continue;
      }
      if (limit.default < limit.min || limit.default > limit.max) {
        errors.push(
          `${numericLimitLabels[parsedKey]} default must sit within the min/max range.`,
        );
        continue;
      }
      if (
        parsedKey === "similarityThreshold" &&
        (limit.min < 0 || limit.max > 1 || limit.default < 0 || limit.default > 1)
      ) {
        errors.push("Similarity threshold values must stay between 0 and 1.");
      }
    }
    return errors;
  }, [config.numericLimits]);

  const hasNumericErrors = numericLimitErrors.length > 0;

  const isFormBusy = saveStatus === "saving";
  const isSaveDisabled = hasNumericErrors || isFormBusy;

  const handleSave = async () => {
    if (isSaveDisabled) {
      return;
    }
    setSaveStatus("saving");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/chat-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });
      const payload = (await response.json().catch(() => null)) as
        | SaveConfigResponse
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save chat config.");
      }
      setLastSavedAt(payload?.updatedAt ?? new Date().toISOString());
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save chat configuration.";
      setErrorMessage(message);
      setSaveStatus("error");
    }
  };

  const updateNumericLimit = (
    key: keyof AdminChatConfig["numericLimits"],
    field: keyof AdminNumericLimit,
    value: number,
  ) => {
    updateConfig((prev) => ({
      ...prev,
      numericLimits: {
        ...prev.numericLimits,
        [key]: {
          ...prev.numericLimits[key],
          [field]: value,
        },
      },
    }));
  };

  const updateAllowlistArray = (
    key: keyof AdminChatConfig["allowlist"],
    values: string[],
  ) => {
    updateConfig((prev) => ({
      ...prev,
      allowlist: {
        ...prev.allowlist,
        [key]: values,
      },
    }));
  };

  const updatePreset = (
    presetName: PresetKey,
    updater: (preset: SessionChatConfigPreset) => SessionChatConfigPreset,
  ) => {
    updateConfig((prev) => ({
      ...prev,
      presets: {
        ...prev.presets,
        [presetName]: updater(prev.presets[presetName]),
      },
    }));
  };

  return (
    <>
      <div className="admin-chat-config-page__inner">
        <header className="admin-chat-config-page__hero">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Admin
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Chat Configuration (Admin)
            </h1>
            <p className="text-sm text-slate-500">
              {lastSavedAt
                ? `Last saved ${new Date(lastSavedAt).toLocaleString()}`
                : "Not saved yet."}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setIsRawModalOpen(true)}
            >
              View raw JSON
            </Button>
            <Button
              variant="default"
              type="button"
              onClick={handleSave}
              disabled={isSaveDisabled}
            >
              {saveStatus === "saving" ? "Saving…" : "Save"}
            </Button>
          </div>
        </header>

        {errorMessage && (
          <div className="admin-chat-config-page__error">{errorMessage}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Core Behavior &amp; User Prompt Defaults</CardTitle>
            <CardDescription>
              Update the language that describes the assistant’s job and the
              default system prompt that each visitor sees.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="coreSummary">System Core Behavior</Label>
              <Textarea
                id="coreSummary"
                value={config.coreSystemPromptSummary}
                onChange={(event) =>
                  updateConfig((prev) => ({
                    ...prev,
                    coreSystemPromptSummary: event.target.value,
                  }))
                }
                rows={3}
              />
              <p className="text-xs text-slate-500">
                Shown as the “System Core Behavior” description in the chat
                settings drawer.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="userPromptDefault">User System Prompt</Label>
              <Textarea
                id="userPromptDefault"
                value={config.userSystemPromptDefault}
                onChange={(event) =>
                  updateConfig((prev) => ({
                    ...prev,
                    userSystemPromptDefault: event.target.value,
                  }))
                }
                rows={4}
              />
            </div>
            <div className="grid max-w-sm items-center gap-2">
              <Label htmlFor="userPromptMaxLength">Prompt max length</Label>
              <Input
                id="userPromptMaxLength"
                type="number"
                min={0}
                value={config.userSystemPromptMaxLength}
                onChange={(event) =>
                  updateConfig((prev) => ({
                    ...prev,
                    userSystemPromptMaxLength: Number(event.target.value) || 0,
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Numeric Limits</CardTitle>
            <CardDescription>
              Guardrail the possible values session presets can reach.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {(
              Object.keys(config.numericLimits) as Array<
                keyof AdminChatConfig["numericLimits"]
              >
            ).map((key) => {
              const limit = config.numericLimits[key];
              return (
                <div
                  key={key}
                  className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm sm:p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {numericLimitLabels[key]}
                      </p>
                      <p className="text-xs text-slate-500">
                        Set guardrails for this value across presets.
                      </p>
                    </div>
                    <span className="text-[0.62rem] font-semibold uppercase tracking-[0.5em] text-slate-400 sm:text-right">
                      Min ≤ Default ≤ Max
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`${key}-min`}
                        className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-500"
                      >
                        Min
                      </Label>
                      <Input
                        id={`${key}-min`}
                        type="number"
                        value={limit.min}
                        onChange={(event) =>
                          updateNumericLimit(
                            key,
                            "min",
                            Number(event.target.value) || 0,
                          )
                        }
                        min={key === "similarityThreshold" ? 0 : undefined}
                        max={
                          key === "similarityThreshold" ? 1 : undefined
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`${key}-default`}
                        className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-500"
                      >
                        Default
                      </Label>
                      <Input
                        id={`${key}-default`}
                        type="number"
                        value={limit.default}
                        onChange={(event) =>
                          updateNumericLimit(
                            key,
                            "default",
                            Number(event.target.value) || 0,
                          )
                        }
                        min={key === "similarityThreshold" ? 0 : undefined}
                        max={
                          key === "similarityThreshold" ? 1 : undefined
                        }
                        step={key === "similarityThreshold" ? 0.01 : 1}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`${key}-max`}
                        className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-500"
                      >
                        Max
                      </Label>
                      <Input
                        id={`${key}-max`}
                        type="number"
                        value={limit.max}
                        onChange={(event) =>
                          updateNumericLimit(
                            key,
                            "max",
                            Number(event.target.value) || 0,
                          )
                        }
                        min={key === "similarityThreshold" ? 0 : undefined}
                        max={
                          key === "similarityThreshold" ? 1 : undefined
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {hasNumericErrors && (
              <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {numericLimitErrors[0]}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Allowlist</CardTitle>
            <CardDescription>
              Control which models, engines, and rankers visitors can pick.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {allowlistArrayFields.map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`allowlist-${field}`}>
                    {allowlistFieldLabels[field]}
                  </Label>
                  <Textarea
                    id={`allowlist-${field}`}
                    rows={3}
                    value={arrayToText(config.allowlist[field] ?? [])}
                    onChange={(event) =>
                      updateAllowlistArray(field, textToArray(event.target.value))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.allowlist.allowReverseRAG}
                  onChange={(event) =>
                    updateConfig((prev) => ({
                      ...prev,
                      allowlist: {
                        ...prev.allowlist,
                        allowReverseRAG: event.target.checked,
                      },
                    }))
                  }
                />
                Allow Reverse RAG
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.allowlist.allowHyde}
                  onChange={(event) =>
                    updateConfig((prev) => ({
                      ...prev,
                      allowlist: {
                        ...prev.allowlist,
                        allowHyde: event.target.checked,
                      },
                    }))
                  }
                />
                Allow HyDE
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary Presets</CardTitle>
            <CardDescription>
              Choose how often summaries run for each level.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(
              Object.keys(config.summaryPresets) as Array<
                keyof AdminChatConfig["summaryPresets"]
              >
            ).map((level) => (
              <div
                key={level}
                className="grid grid-cols-2 items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3"
              >
                <span className="font-semibold text-slate-700 capitalize">
                  {level}
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Label className="text-xs" htmlFor={`summary-${level}`}>
                    Every n turns
                  </Label>
                  <Input
                    id={`summary-${level}`}
                    type="number"
                    min={1}
                    value={config.summaryPresets[level].every_n_turns}
                    onChange={(event) =>
                      updateConfig((prev) => ({
                        ...prev,
                        summaryPresets: {
                          ...prev.summaryPresets,
                          [level]: {
                            every_n_turns:
                              Number(event.target.value) > 0
                                ? Number(event.target.value)
                                : 1,
                          },
                        },
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session Presets</CardTitle>
            <CardDescription>
              Customize each preset so it stays within the allowed limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(
              Object.entries(config.presets) as Array<
                [PresetKey, SessionChatConfigPreset]
              >
            ).map(([presetKey, preset]) => (
              <details
                key={presetKey}
                className="rounded-2xl border border-slate-200 bg-white"
                open
              >
                <summary className="cursor-pointer px-4 py-3 text-lg font-semibold text-slate-800">
                  {presetKey === "fast"
                    ? "Fast"
                    : presetKey === "highRecall"
                    ? "High Recall"
                    : "Default"}
                </summary>
                <div className="space-y-4 px-4 pb-4">
                  <div className="space-y-2">
                    <Label>User System Prompt</Label>
                    <Textarea
                      rows={3}
                      value={preset.userSystemPrompt}
                      onChange={(event) =>
                        updatePreset(presetKey, (prev) => ({
                          ...prev,
                          userSystemPrompt: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>LLM Model</Label>
                      <Select
                        value={preset.llmModel}
                        onValueChange={(value) =>
                          updatePreset(presetKey, (prev) => ({
                            ...prev,
                            llmModel: value,
                          }))
                        }
                      >
                        <SelectTrigger />
                        <SelectContent>
                          {config.allowlist.llmModels.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Embedding Model</Label>
                      <Select
                        value={preset.embeddingModel}
                        onValueChange={(value) =>
                          updatePreset(presetKey, (prev) => ({
                            ...prev,
                            embeddingModel: value,
                          }))
                        }
                      >
                        <SelectTrigger />
                        <SelectContent>
                          {config.allowlist.embeddingModels.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Chat Engine</Label>
                      <Select
                        value={preset.chatEngine}
                        onValueChange={(value) =>
                          updatePreset(presetKey, (prev) => ({
                            ...prev,
                            chatEngine: value,
                          }))
                        }
                      >
                        <SelectTrigger />
                        <SelectContent>
                          {config.allowlist.chatEngines.map((engine) => (
                            <SelectItem key={engine} value={engine}>
                              {engine}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>RAG enabled</Label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={preset.rag.enabled}
                          onChange={(event) =>
                            updatePreset(presetKey, (prev) => ({
                              ...prev,
                              rag: {
                                ...prev.rag,
                                enabled: event.target.checked,
                              },
                            }))
                          }
                        />
                        Enabled
                      </label>
                    </div>
                    <div className="grid gap-3">
                      <div className="space-y-1">
                        <Label>RAG Top K</Label>
                        <Input
                          type="number"
                          min={config.numericLimits.ragTopK.min}
                          max={config.numericLimits.ragTopK.max}
                          value={preset.rag.topK}
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
                      </div>
                      <div className="space-y-1">
                        <Label>Similarity</Label>
                        <Input
                          type="number"
                          step={0.01}
                          min={config.numericLimits.similarityThreshold.min}
                          max={config.numericLimits.similarityThreshold.max}
                          value={preset.rag.similarity}
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
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Token Budget</Label>
                      <Input
                        type="number"
                        min={config.numericLimits.contextBudget.min}
                        max={config.numericLimits.contextBudget.max}
                        value={preset.context.tokenBudget}
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
                    </div>
                    <div className="space-y-1">
                      <Label>History Budget</Label>
                      <Input
                        type="number"
                        min={config.numericLimits.historyBudget.min}
                        max={config.numericLimits.historyBudget.max}
                        value={preset.context.historyBudget}
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
                    </div>
                    <div className="space-y-1">
                      <Label>Clip Tokens</Label>
                      <Input
                        type="number"
                        min={config.numericLimits.clipTokens.min}
                        max={config.numericLimits.clipTokens.max}
                        value={preset.context.clipTokens}
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
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          config.allowlist.allowReverseRAG
                            ? preset.features.reverseRAG
                            : false
                        }
                        disabled={!config.allowlist.allowReverseRAG}
                        onChange={(event) =>
                          updatePreset(presetKey, (prev) => ({
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
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          config.allowlist.allowHyde ? preset.features.hyde : false
                        }
                        disabled={!config.allowlist.allowHyde}
                        onChange={(event) =>
                          updatePreset(presetKey, (prev) => ({
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
                  </div>

                  <div className="space-y-2">
                    <Label>Ranker</Label>
                    <Select
                      value={preset.features.ranker}
                      onValueChange={(value) =>
                        updatePreset(presetKey, (prev) => ({
                          ...prev,
                          features: {
                            ...prev.features,
                            ranker: value,
                          },
                        }))
                      }
                    >
                      <SelectTrigger />
                      <SelectContent>
                        {config.allowlist.rankers.map((ranker) => (
                          <SelectItem key={ranker} value={ranker}>
                            {ranker}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label>Summary Level</Label>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {summaryLevelOptions.map((level) => (
                        <label
                          key={level}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs"
                        >
                          <input
                            type="radio"
                            name={`${presetKey}-summary`}
                            value={level}
                            checked={preset.summaryLevel === level}
                            onChange={() =>
                              updatePreset(presetKey, (prev) => ({
                                ...prev,
                                summaryLevel: level,
                              }))
                            }
                          />
                          {level}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </CardContent>
        </Card>

      </div>

      {isRawModalOpen && (
        <div className="admin-chat-config-page__raw-overlay">
          <div
            className="admin-chat-config-page__raw-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Raw admin chat config"
          >
            <div className="admin-chat-config-page__raw-modal-header">
              <div className="admin-chat-config-page__raw-modal-title-block">
                <h2>
                  <strong>Raw Admin Chat Config Data</strong>{" "}
                  <span>(JSON)</span>
                </h2>
                <p className="admin-chat-config-page__raw-modal-description">
                  This is for read-only.
                </p>
              </div>
              <button
                className="admin-chat-config-page__raw-modal-close"
                onClick={() => setIsRawModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <pre className="admin-chat-config-page__raw-modal-body">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

export default function ChatConfigPage({
  adminConfig,
  lastUpdatedAt,
  headerRecordMap,
  headerBlockId,
}: PageProps) {
  return (
    <>
      <Head>
        <title>Chat Configuration · Admin</title>
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
      >
        <AdminChatConfigForm
          adminConfig={adminConfig}
          lastUpdatedAt={lastUpdatedAt}
        />
      </AiPageChrome>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [adminConfig, metadata, header] = await Promise.all([
    getAdminChatConfig(),
    getAdminChatConfigMetadata(),
    loadNotionNavigationHeader(),
  ]);
  return {
    props: {
      adminConfig,
      lastUpdatedAt: metadata.updatedAt,
      ...header,
    },
  };
};
