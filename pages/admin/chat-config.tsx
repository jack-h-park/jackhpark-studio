import type { GetServerSideProps } from "next";
import { FiBookOpen } from "@react-icons/all-files/fi/FiBookOpen";
import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { FiSettings } from "@react-icons/all-files/fi/FiSettings";
import { FiShield } from "@react-icons/all-files/fi/FiShield";
import { FiSliders } from "@react-icons/all-files/fi/FiSliders";
import Head from "next/head";
import Link from "next/link";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  AdminChatConfig,
  AdminNumericLimit,
  SessionChatConfigPreset,
  SummaryLevel,
} from "@/types/chat-config";
import { AiPageChrome } from "@/components/AiPageChrome";
import { AllowlistTile } from "@/components/ui/allowlist-tile";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeaderCard } from "@/components/ui/page-header-card";
import { Radiobutton } from "@/components/ui/radiobutton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import {
  getAdminChatConfig,
  getAdminChatConfigMetadata,
} from "@/lib/server/admin-chat-config";
import {
  loadNotionNavigationHeader,
  type NotionNavigationHeader,
} from "@/lib/server/notion-header";
import {
  CHAT_ENGINE_LABELS,
  CHAT_ENGINE_OPTIONS,
  type ChatEngine,
} from "@/lib/shared/model-provider";
import {
  type EmbeddingModelId,
  LLM_MODEL_DEFINITIONS,
  type LlmModelDefinition,
  type LlmModelId,
  RANKER_DESCRIPTIONS,
  RANKER_OPTIONS,
  type RankerId,
} from "@/lib/shared/models";
import { cn } from "@/lib/utils";

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

const summaryLevelOptions: SummaryLevel[] = ["off", "low", "medium", "high"];

const presetDisplayNames: Record<PresetKey, string> = {
  default: "Default",
  fast: "Fast",
  highRecall: "High Recall",
};

const presetDisplayOrder: PresetKey[] = ["default", "fast", "highRecall"];

const LLM_MODEL_DEFINITIONS_MAP = new Map<LlmModelId, LlmModelDefinition>(
  LLM_MODEL_DEFINITIONS.map((definition) => [
    definition.id as LlmModelId,
    definition as LlmModelDefinition,
  ]),
);

const EMBEDDING_MODEL_OPTIONS = listEmbeddingModelOptions();

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
  const [isWordWrapEnabled, setIsWordWrapEnabled] = useState(false);
  const [contextHistoryEnabled, setContextHistoryEnabled] = useState<
    Record<PresetKey, boolean>
  >(() =>
    presetDisplayOrder.reduce<Record<PresetKey, boolean>>(
      (acc, presetKey) => {
        acc[presetKey] = true;
        return acc;
      },
      {} as Record<PresetKey, boolean>,
    ),
  );

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
        (limit.min < 0 ||
          limit.max > 1 ||
          limit.default < 0 ||
          limit.default > 1)
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
      const payload = (await response
        .json()
        .catch(() => null)) as SaveConfigResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save chat config.");
      }
      setLastSavedAt(payload?.updatedAt ?? new Date().toISOString());
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to save chat configuration.";
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

  type AllowlistKey =
    | "llmModels"
    | "embeddingModels"
    | "rankers"
    | "chatEngines";
  type AllowlistValueMap = {
    llmModels: LlmModelId;
    embeddingModels: EmbeddingModelId;
    rankers: RankerId;
    chatEngines: ChatEngine;
  };

  const toggleAllowlistValue = <K extends AllowlistKey>(
    key: K,
    value: AllowlistValueMap[K],
    enable = true,
  ) => {
    updateConfig((prev) => {
      const current = prev.allowlist[key] as AllowlistValueMap[K][];
      const includesValue = current.includes(value);
      if (enable && includesValue) {
        return prev;
      }
      if (!enable && !includesValue) {
        return prev;
      }
      const next = enable
        ? [...current, value]
        : current.filter((item) => item !== value);
      const sortedNext =
        key === "chatEngines"
          ? (CHAT_ENGINE_OPTIONS.filter((engine) =>
              (next as ChatEngine[]).includes(engine),
            ) as AllowlistValueMap[K][])
          : next.toSorted((a, b) => String(a).localeCompare(String(b)));
      return {
        ...prev,
        allowlist: {
          ...prev.allowlist,
          [key]: sortedNext as AdminChatConfig["allowlist"][K],
        },
      };
    });
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

  const llmModelUnionIds = useMemo(() => {
    const baseIds = LLM_MODEL_DEFINITIONS.map(
      (definition) => definition.id,
    ) as LlmModelId[];
    const union = new Set<string>([...baseIds, ...config.allowlist.llmModels]);
    return [...union].toSorted((a, b) => a.localeCompare(b)) as LlmModelId[];
  }, [config.allowlist.llmModels]);

  const llmModelOptions = useMemo(
    () =>
      llmModelUnionIds.map((id) => ({
        id,
        label: LLM_MODEL_DEFINITIONS_MAP.get(id)?.label ?? id,
      })),
    [llmModelUnionIds],
  );

  const sessionGridLabelClass =
    "flex items-center text-[0.85rem] font-semibold text-[color:var(--ai-text-muted)]";
  const sessionGridValueClass = "flex flex-col gap-1";
  const sessionGridHeaderClass =
    "text-[0.75rem] font-semibold uppercase tracking-[0.25em] text-[color:var(--ai-text-strong)]";
  const summaryGridLabelClass =
    "text-[0.9rem] font-semibold text-[color:var(--ai-text-muted)]";
  const summaryGridHeaderClass =
    "text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--ai-text-strong)]";
  const summaryGridValueClass = "flex flex-col gap-1";

  function PresetSettingsGroup({
    title,
    groupId,
    renderHeaderCell,
    children,
  }: {
    title: string;
    groupId: string;
    renderHeaderCell: (
      presetKey: PresetKey,
      headerLabelId: string,
    ) => ReactNode;
    children: ReactNode;
  }) {
    const headerLabelId = `${groupId}-label`;

    return (
      <Fragment key={`group-${groupId}`}>
        <div id={headerLabelId} className={sessionGridLabelClass}>
          {title}
        </div>
        {presetDisplayOrder.map((presetKey) => (
          <div
            key={`${groupId}-header-${presetKey}`}
            className={sessionGridValueClass}
          >
            {renderHeaderCell(presetKey, headerLabelId)}
          </div>
        ))}
        {children}
      </Fragment>
    );
  }

  const renderPresetRow = (
    label: string,
    renderCell: (presetKey: PresetKey) => ReactNode,
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
    <>
      <PageHeaderCard
        overline="Admin"
        title="Chat Configuration"
        description="Configure chat behavior, guardrails, and session presets."
        meta={
          <span>
            {lastSavedAt
              ? `Last saved ${new Date(lastSavedAt).toLocaleString()}`
              : "Not saved yet."}
          </span>
        }
        actions={
          <>
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
          </>
        }
      />

      {errorMessage && (
        <Card className="border-l-4 border-[color:var(--ai-error)] bg-[color:color-mix(in srgb, var(--ai-bg) 85%, var(--ai-error) 15%)]">
          <CardContent className="px-4 py-3 text-[color:var(--ai-error)]">
            {errorMessage}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle icon={<FiSettings aria-hidden="true" />}>
            Core Behavior &amp; User Prompt Defaults
          </CardTitle>
          <CardDescription>
            Update the language that describes the assistant’s job and the
            default system prompt that each visitor sees.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="ai-field">
            <Label htmlFor="coreSummary" className="ai-field__label">
              System Core Behavior
            </Label>
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
            <p className="ai-field__description">
              Shown as the “System Core Behavior” description in the chat
              settings drawer.
            </p>
          </div>
          <div className="ai-field">
            <Label htmlFor="userPromptDefault" className="ai-field__label">
              User System Prompt
            </Label>
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
          <div className="ai-field max-w-sm">
            <Label htmlFor="userPromptMaxLength" className="ai-field__label">
              Prompt max length
            </Label>
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
          <CardTitle icon={<FiShield aria-hidden="true" />}>
            Guardrail Keywords &amp; Fallbacks
          </CardTitle>
          <CardDescription>
            Define how guardrails recognize chit-chat and how the assistant
            responds when light conversation or command intents are detected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="ai-field">
            <Label htmlFor="guardrailKeywords" className="ai-field__label">
              Chit-chat keywords
            </Label>
            <Textarea
              id="guardrailKeywords"
              rows={3}
              value={arrayToText(config.guardrails.chitchatKeywords)}
              onChange={(event) =>
                updateConfig((prev) => ({
                  ...prev,
                  guardrails: {
                    ...prev.guardrails,
                    chitchatKeywords: textToArray(event.target.value),
                  },
                }))
              }
            />
            <p className="ai-field__description">
              Add keywords or phrases that should be treated as lightweight
              chit-chat and handled without hitting the knowledge base.
            </p>
          </div>
          <div className="ai-field">
            <Label
              htmlFor="guardrailFallbackChitchat"
              className="ai-field__label"
            >
              Chit-chat fallback context
            </Label>
            <Textarea
              id="guardrailFallbackChitchat"
              value={config.guardrails.fallbackChitchat}
              onChange={(event) =>
                updateConfig((prev) => ({
                  ...prev,
                  guardrails: {
                    ...prev.guardrails,
                    fallbackChitchat: event.target.value,
                  },
                }))
              }
              rows={3}
            />
            <p className="ai-field__description">
              The concise, friendly prompt injected whenever a chit-chat intent
              is detected.
            </p>
          </div>
          <div className="ai-field">
            <Label
              htmlFor="guardrailFallbackCommand"
              className="ai-field__label"
            >
              Command fallback context
            </Label>
            <Textarea
              id="guardrailFallbackCommand"
              value={config.guardrails.fallbackCommand}
              onChange={(event) =>
                updateConfig((prev) => ({
                  ...prev,
                  guardrails: {
                    ...prev.guardrails,
                    fallbackCommand: event.target.value,
                  },
                }))
              }
              rows={3}
            />
            <p className="ai-meta-text">
              The polite refusal context shown whenever a user asks the
              assistant to run actions or commands.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle icon={<FiSliders aria-hidden="true" />}>
            Numeric Limits
          </CardTitle>
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
                className="rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold ">
                      {numericLimitLabels[key]}
                    </p>
                    <p className="ai-field__description">
                      Set guardrails for this value across presets.
                    </p>
                  </div>
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.5em] text-slate-400 sm:text-right">
                    Min ≤ Default ≤ Max
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="ai-field">
                    <Label htmlFor={`${key}-min`} className="ai-field__label">
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
                      max={key === "similarityThreshold" ? 1 : undefined}
                    />
                  </div>
                  <div className="ai-field">
                    <Label
                      htmlFor={`${key}-default`}
                      className="ai-field__label"
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
                      max={key === "similarityThreshold" ? 1 : undefined}
                      step={key === "similarityThreshold" ? 0.01 : 1}
                    />
                  </div>
                  <div className="ai-field">
                    <Label htmlFor={`${key}-max`} className="ai-field__label">
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
                      max={key === "similarityThreshold" ? 1 : undefined}
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
          <CardTitle icon={<FiShield aria-hidden="true" />}>
            Allowlist
          </CardTitle>
          <CardDescription>
            Control which models, engines, and rankers visitors can pick.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Chat Engines</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHAT_ENGINE_OPTIONS.map((engine) => {
                const isSelected =
                  config.allowlist.chatEngines.includes(engine);
                const label = CHAT_ENGINE_LABELS[engine] ?? engine;
                return (
                  <AllowlistTile
                    key={engine}
                    id={engine}
                    label={label}
                    subtitle={engine}
                    // description={`Enable ${label}`}
                    selected={isSelected}
                    onClick={() =>
                      toggleAllowlistValue("chatEngines", engine, !isSelected)
                    }
                  />
                );
              })}
            </div>
            <p className="ai-meta-text">
              Choose which chat engines visitors can use.
            </p>
          </div>

          <div className="space-y-2">
            <Label>LLM Models</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {llmModelOptions.map((option) => {
                const isSelected = config.allowlist.llmModels.includes(
                  option.id,
                );
                return (
                  <AllowlistTile
                    key={option.id}
                    id={option.id}
                    label={option.label}
                    subtitle={option.id}
                    // description={`Use ${option.id}`}
                    selected={isSelected}
                    onClick={() =>
                      toggleAllowlistValue("llmModels", option.id, !isSelected)
                    }
                  />
                );
              })}
            </div>
            <p className="ai-meta-text">
              Choose which LLM models visitors can select. Values like
              “gpt-4o-mini” or “mistral” are stored and used directly.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Embedding Models</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {EMBEDDING_MODEL_OPTIONS.map((space) => {
                const isSelected = config.allowlist.embeddingModels.includes(
                  space.embeddingSpaceId,
                );
                return (
                  <AllowlistTile
                    key={space.embeddingSpaceId}
                    id={space.embeddingSpaceId}
                    label={space.label}
                    subtitle={space.embeddingSpaceId}
                    description={`Enable ${space.label}`}
                    selected={isSelected}
                    onClick={() =>
                      toggleAllowlistValue(
                        "embeddingModels",
                        space.embeddingSpaceId,
                        !isSelected,
                      )
                    }
                  />
                );
              })}
            </div>
            <p className="ai-meta-text">
              Embedding model used for RAG. This is a canonical space ID, such
              as “openai_te3s_v1.”
            </p>
          </div>

          <div className="space-y-2">
            <Label>Ranker Allowlist</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {RANKER_OPTIONS.map((ranker) => {
                const isSelected = config.allowlist.rankers.includes(ranker);
                const description = RANKER_DESCRIPTIONS[ranker];
                return (
                  <AllowlistTile
                    key={ranker}
                    id={ranker}
                    label={ranker}
                    subtitle={description}
                    description={description}
                    selected={isSelected}
                    onClick={() =>
                      toggleAllowlistValue("rankers", ranker, !isSelected)
                    }
                  />
                );
              })}
            </div>
            <p className="ai-meta-text">
              Reranking strategy. Use “none”, “mmr”, or “cohere-rerank”.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-1">
            <div className="inline-flex items-center gap-2">
              <Checkbox
                className="shrink-0"
                aria-label="Allow Reverse RAG"
                checked={config.allowlist.allowReverseRAG}
                onCheckedChange={(checked) =>
                  updateConfig((prev) => ({
                    ...prev,
                    allowlist: {
                      ...prev.allowlist,
                      allowReverseRAG: checked,
                    },
                  }))
                }
              />
              <span className="text-sm">Allow Reverse RAG</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <Checkbox
                className="shrink-0"
                aria-label="Allow HyDE"
                checked={config.allowlist.allowHyde}
                onCheckedChange={(checked) =>
                  updateConfig((prev) => ({
                    ...prev,
                    allowlist: {
                      ...prev.allowlist,
                      allowHyde: checked,
                    },
                  }))
                }
              />
              <span className="text-sm">Allow HyDE</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle icon={<FiBookOpen aria-hidden="true" />}>
            RAG Document Metadata
          </CardTitle>
          <CardDescription>
            Review and adjust document-level metadata used during RAG retrieval
            (doc_type, persona_type, visibility, tags). Use the dedicated
            manager for fine-grained edits.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 max-w-xl">
            <p className="ai-meta-text">
              Metadata such as <code>doc_type</code>, <code>persona_type</code>,
              <code>is_public</code>, and <code>tags</code> is applied per
              document and used by the retrieval layer for filtering and
              ranking.
            </p>
            <p className="ai-meta-text">
              To perform document-level edits, open the RAG Documents manager
              below. Changes will be picked up automatically on the next
              ingestion or metadata-only refresh.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <Button variant="outline" type="button">
              <Link href="/admin/documents">Open RAG Documents Manager</Link>
            </Button>
            <p className="ai-meta-text text-xs">
              Tip: use this when you want to reclassify a page (e.g. profile vs
              project article) or adjust visibility without changing content.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle icon={<FiBookOpen aria-hidden="true" />}>
            Summary Presets
          </CardTitle>
          <CardDescription>
            Choose how often summaries run for each level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GridPanel className="px-4 py-4">
            <div className="grid grid-cols-[minmax(150px,1fr)_repeat(3,minmax(0,1fr))] gap-3 items-center">
              <div
                className={`${summaryGridLabelClass} ${summaryGridHeaderClass}`}
              >
                Summary level
              </div>
              {["low", "medium", "high"].map((level) => (
                <div
                  key={`summary-header-${level}`}
                  className={summaryGridHeaderClass}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </div>
              ))}
              <div className={summaryGridLabelClass}>Every n turns</div>
              {(
                ["low", "medium", "high"] as Array<
                  keyof AdminChatConfig["summaryPresets"]
                >
              ).map((level) => (
                <div key={`summary-${level}`} className={summaryGridValueClass}>
                  <Input
                    id={`summary-${level}`}
                    type="number"
                    min={1}
                    aria-label={`Every n turns for ${level} summary`}
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
                  <span className="text-xs text-slate-500">turn(s)</span>
                </div>
              ))}
            </div>
          </GridPanel>
        </CardContent>
      </Card>

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
          <GridPanel className="px-4 py-5 shadow-sm">
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
              {renderPresetRow("User System Prompt", (presetKey) => {
                const preset = config.presets[presetKey];
                return (
                  <Textarea
                    className="min-h-[120px]"
                    rows={4}
                    aria-label={`User System Prompt for ${presetDisplayNames[presetKey]}`}
                    value={preset.userSystemPrompt}
                    onChange={(event) =>
                      updatePreset(presetKey, (prev) => ({
                        ...prev,
                        userSystemPrompt: event.target.value,
                      }))
                    }
                  />
                );
              })}
              {renderPresetRow("LLM Model", (presetKey) => (
                <Select
                  value={config.presets[presetKey].llmModel}
                  onValueChange={(value) =>
                    updatePreset(presetKey, (prev) => ({
                      ...prev,
                      llmModel: value as LlmModelId,
                    }))
                  }
                >
                  <SelectTrigger
                    aria-label={`LLM Model for ${presetDisplayNames[presetKey]}`}
                  />
                  <SelectContent>
                    {llmModelOptions.map((option) => (
                      <SelectItem
                        key={option.id}
                        value={option.id}
                        disabled={
                          !config.allowlist.llmModels.includes(option.id)
                        }
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
              {renderPresetRow("Embedding Model", (presetKey) => (
                <Select
                  value={config.presets[presetKey].embeddingModel}
                  onValueChange={(value) =>
                    updatePreset(presetKey, (prev) => ({
                      ...prev,
                      embeddingModel: value as EmbeddingModelId,
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
                            space.embeddingSpaceId,
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
                  value={config.presets[presetKey].chatEngine}
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
              <PresetSettingsGroup
                title="Retrieval (RAG)"
                groupId="retrieval-rag"
                renderHeaderCell={(presetKey, headerLabelId) => {
                  const preset = config.presets[presetKey];
                  const toggleLabelId = `${headerLabelId}-toggle-${presetKey}`;
                  return (
                    <div className="inline-flex items-center gap-2">
                      <span className="sr-only" id={toggleLabelId}>
                        Toggle Retrieval (RAG) for{" "}
                        {presetDisplayNames[presetKey]}
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
                    min={config.numericLimits.ragTopK.min}
                    max={config.numericLimits.ragTopK.max}
                    aria-label={`RAG Top K for ${presetDisplayNames[presetKey]}`}
                    value={config.presets[presetKey].rag.topK}
                    disabled={!config.presets[presetKey].rag.enabled}
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
                    min={config.numericLimits.similarityThreshold.min}
                    max={config.numericLimits.similarityThreshold.max}
                    aria-label={`Similarity for ${presetDisplayNames[presetKey]}`}
                    value={config.presets[presetKey].rag.similarity}
                    disabled={!config.presets[presetKey].rag.enabled}
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
                  const preset = config.presets[presetKey];
                  const ragDisabled = !preset.rag.enabled;
                  return (
                    <div className="inline-flex items-center gap-2 text-sm">
                      <Checkbox
                        className="shrink-0"
                        aria-label={`Reverse RAG for ${presetDisplayNames[presetKey]}`}
                        checked={
                          config.allowlist.allowReverseRAG
                            ? preset.features.reverseRAG
                            : false
                        }
                        disabled={
                          !config.allowlist.allowReverseRAG || ragDisabled
                        }
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
                  const preset = config.presets[presetKey];
                  const ragDisabled = !preset.rag.enabled;
                  return (
                    <div className="inline-flex items-center gap-2 text-sm">
                      <Checkbox
                        className="shrink-0"
                        aria-label={`HyDE for ${presetDisplayNames[presetKey]}`}
                        checked={
                          config.allowlist.allowHyde
                            ? preset.features.hyde
                            : false
                        }
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
                    value={config.presets[presetKey].features.ranker}
                    disabled={!config.presets[presetKey].rag.enabled}
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
                    <SelectTrigger
                      aria-label={`Ranker for ${presetDisplayNames[presetKey]}`}
                    />
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
                        checked={
                          config.presets[presetKey].summaryLevel === level
                        }
                        disabled={!config.presets[presetKey].rag.enabled}
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
                        Toggle Context & History editing for{" "}
                        {presetDisplayNames[presetKey]}
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
                      min={config.numericLimits.contextBudget.min}
                      max={config.numericLimits.contextBudget.max}
                      aria-label={`Token Budget for ${presetDisplayNames[presetKey]}`}
                      value={config.presets[presetKey].context.tokenBudget}
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
                      min={config.numericLimits.historyBudget.min}
                      max={config.numericLimits.historyBudget.max}
                      aria-label={`History Budget for ${presetDisplayNames[presetKey]}`}
                      value={config.presets[presetKey].context.historyBudget}
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
                      min={config.numericLimits.clipTokens.min}
                      max={config.numericLimits.clipTokens.max}
                      aria-label={`Clip Tokens for ${presetDisplayNames[presetKey]}`}
                      value={config.presets[presetKey].context.clipTokens}
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

      {isRawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div
            className="flex flex-col w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl bg-[hsl(var(--ai-bg))] shadow-2xl border border-[hsl(var(--ai-border))]"
            role="dialog"
            aria-modal="true"
            aria-label="Raw admin chat config"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--ai-border))] bg-[hsl(var(--ai-bg-muted))]">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-lg font-semibold text-[var(--ai-text-strong)]">
                  Admin Chat Configuration Data{" "}
                  <span className="text-sm font-normal text-[var(--ai-text-muted)]">
                    (JSON)
                  </span>
                </h2>
                <p className="text-xs text-[var(--ai-text-muted)]">
                  This is for read-only.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="word-wrap-toggle"
                    checked={isWordWrapEnabled}
                    onCheckedChange={setIsWordWrapEnabled}
                  />
                  <div className="ai-choice">
                    <Label
                      htmlFor="word-wrap-toggle"
                      className="ai-choice__label cursor-pointer"
                    >
                      Word Wrap
                    </Label>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  type="button"
                  onClick={() => setIsRawModalOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div
              className={cn(
                "flex-1 w-full min-w-0 p-6 bg-[hsl(var(--ai-bg))]",
                isWordWrapEnabled ? "overflow-y-auto" : "overflow-auto",
              )}
            >
              <pre
                className={cn(
                  "text-xs font-mono text-[var(--ai-text)]",
                  isWordWrapEnabled ? "whitespace-pre-wrap" : "whitespace-pre",
                )}
              >
                {JSON.stringify(config, null, 2)}
              </pre>
            </div>
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
