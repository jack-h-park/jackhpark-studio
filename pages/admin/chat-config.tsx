import type { GetServerSideProps } from "next";
import { FiAlertTriangle as AlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiArrowLeft as ArrowLeft } from "@react-icons/all-files/fi/FiArrowLeft";
import { FiCheckCircle as CheckCircle } from "@react-icons/all-files/fi/FiCheckCircle";
import { FiSave as Save } from "@react-icons/all-files/fi/FiSave";
import Head from "next/head";
import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import css from "styled-jsx/css";

import type {
  ChatModelSettings,
  GuardrailDefaults,
  GuardrailNumericSettings,
  GuardrailSettingsResult,
  LangfuseSettings,
} from "@/lib/server/chat-settings";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SYSTEM_PROMPT,
  SYSTEM_PROMPT_MAX_LENGTH,
} from "@/lib/chat-prompts";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { listLlmModelOptions } from "@/lib/core/llm-registry";
import { type ChatEngine } from "@/lib/shared/model-provider";
import {
  DEFAULT_HYDE_ENABLED,
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_ENABLED,
  DEFAULT_REVERSE_RAG_MODE,
  RANKER_MODES,
  type RankerMode,
  REVERSE_RAG_MODES,
  type ReverseRagMode,
} from "@/lib/shared/rag-config";

type PageProps = {
  systemPrompt: string;
  isDefault: boolean;
  defaultPrompt: string;
  guardrails: GuardrailSettingsResult;
  guardrailDefaults: GuardrailDefaults;
  models: ChatModelSettings;
  modelDefaults: ChatModelSettings;
  langfuse: LangfuseSettings;
  langfuseDefaults: LangfuseSettings;
  tracingConfigured: boolean;
  error?: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type GuardrailNumericFormState = {
  similarityThreshold: string;
  ragTopK: string;
  ragContextTokenBudget: string;
  ragContextClipTokens: string;
  historyTokenBudget: string;
  summaryEnabled: boolean;
  summaryTriggerTokens: string;
  summaryMaxTurns: string;
  summaryMaxChars: string;
};

type ModelFormState = {
  engine: ChatEngine;
  llmModelId: string;
  embeddingSpaceId: string;
  reverseRagEnabled: boolean;
  reverseRagMode: ReverseRagMode;
  hydeEnabled: boolean;
  rankerMode: RankerMode;
};

type LangfuseFormState = {
  envTag: string;
  sampleRateDev: string;
  sampleRatePreview: string;
  attachProviderMetadata: boolean;
};

type NumericFieldKey = Exclude<
  keyof GuardrailNumericFormState,
  "summaryEnabled"
>;

const NUMERIC_NUMBER_FIELDS: NumericFieldKey[] = [
  "similarityThreshold",
  "ragTopK",
  "ragContextTokenBudget",
  "ragContextClipTokens",
  "historyTokenBudget",
  "summaryTriggerTokens",
  "summaryMaxTurns",
  "summaryMaxChars",
];

const CLIENT_NUMERIC_DEFAULTS: GuardrailNumericSettings = {
  similarityThreshold: 0.78,
  ragTopK: 5,
  ragContextTokenBudget: 1200,
  ragContextClipTokens: 320,
  historyTokenBudget: 900,
  summaryEnabled: true,
  summaryTriggerTokens: 400,
  summaryMaxTurns: 6,
  summaryMaxChars: 600,
};

const REVERSE_RAG_MODE_LABELS: Record<ReverseRagMode, string> = {
  precision: "Precision (focused topics only)",
  recall: "Recall (synonyms & broader recall)",
};

const RANKER_MODE_LABELS: Record<RankerMode, string> = {
  none: "None (vector order)",
  mmr: "MMR (diversity + relevance)",
  cohere: "Cohere (external reranker)",
};

const toNumericFormState = (
  numeric?: GuardrailNumericSettings | null,
  fallback?: GuardrailNumericSettings,
): GuardrailNumericFormState => {
  const source = numeric ?? fallback ?? CLIENT_NUMERIC_DEFAULTS;
  return {
    similarityThreshold: source.similarityThreshold.toString(),
    ragTopK: source.ragTopK.toString(),
    ragContextTokenBudget: source.ragContextTokenBudget.toString(),
    ragContextClipTokens: source.ragContextClipTokens.toString(),
    historyTokenBudget: source.historyTokenBudget.toString(),
    summaryEnabled: source.summaryEnabled,
    summaryTriggerTokens: source.summaryTriggerTokens.toString(),
    summaryMaxTurns: source.summaryMaxTurns.toString(),
    summaryMaxChars: source.summaryMaxChars.toString(),
  };
};

const LLM_MODEL_OPTIONS = listLlmModelOptions();
const LLM_MODEL_OPTION_MAP = new Map(
  LLM_MODEL_OPTIONS.map((option) => [option.id, option]),
);
const EMBEDDING_MODEL_OPTIONS = listEmbeddingModelOptions();
const EMBEDDING_MODEL_OPTION_MAP = new Map(
  EMBEDDING_MODEL_OPTIONS.map((option) => [option.embeddingSpaceId, option]),
);

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

type CardProps = {
  children: ReactNode;
  className?: string;
  tone?: "default" | "danger";
};

function Card({ children, className, tone = "default" }: CardProps) {
  return (
    <section
      className={cx(
        "chat-card",
        tone === "danger" && "chat-card--danger",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("chat-card__header", className)}>{children}</header>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="chat-card__title">{children}</h2>;
}

function CardDescription({ children }: { children: ReactNode }) {
  return <p className="chat-card__description">{children}</p>;
}

function CardContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("chat-card__content", className)}>{children}</div>;
}

function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer className={cx("chat-card__footer", className)}>{children}</footer>
  );
}

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

function Button({
  children,
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "chat-btn",
        `chat-btn--variant-${variant}`,
        `chat-btn--size-${size}`,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const toModelFormState = (
  models?: ChatModelSettings,
  fallback?: ChatModelSettings,
): ModelFormState => {
  const source = models ?? fallback;
  const defaultLlm = LLM_MODEL_OPTIONS[0]?.id ?? "";
  const defaultEmbedding = EMBEDDING_MODEL_OPTIONS[0]?.embeddingSpaceId ?? "";
  return {
    engine: source?.engine ?? "lc",
    llmModelId: source?.llmModelId ?? source?.llmModel ?? defaultLlm,
    embeddingSpaceId:
      source?.embeddingSpaceId ?? source?.embeddingModelId ?? defaultEmbedding,
    reverseRagEnabled: source?.reverseRagEnabled ?? DEFAULT_REVERSE_RAG_ENABLED,
    reverseRagMode: source?.reverseRagMode ?? DEFAULT_REVERSE_RAG_MODE,
    hydeEnabled: source?.hydeEnabled ?? DEFAULT_HYDE_ENABLED,
    rankerMode: source?.rankerMode ?? DEFAULT_RANKER_MODE,
  };
};

const toLangfuseFormState = (
  settings?: LangfuseSettings,
  fallback?: LangfuseSettings,
): LangfuseFormState => {
  const source = settings ?? fallback;
  return {
    envTag: source?.envTag ?? "",
    sampleRateDev: (source?.sampleRateDev ?? 0).toString(),
    sampleRatePreview: (source?.sampleRatePreview ?? 0).toString(),
    attachProviderMetadata: source?.attachProviderMetadata ?? true,
  };
};

const parseNumericPayload = (
  state: GuardrailNumericFormState,
): GuardrailNumericSettings => {
  return {
    similarityThreshold: parseGuardrailNumber(
      state.similarityThreshold,
      "Similarity threshold",
    ),
    ragTopK: parseGuardrailNumber(state.ragTopK, "RAG top K"),
    ragContextTokenBudget: parseGuardrailNumber(
      state.ragContextTokenBudget,
      "Context token budget",
    ),
    ragContextClipTokens: parseGuardrailNumber(
      state.ragContextClipTokens,
      "Context clip tokens",
    ),
    historyTokenBudget: parseGuardrailNumber(
      state.historyTokenBudget,
      "History token budget",
    ),
    summaryEnabled: state.summaryEnabled,
    summaryTriggerTokens: parseGuardrailNumber(
      state.summaryTriggerTokens,
      "Summary trigger tokens",
    ),
    summaryMaxTurns: parseGuardrailNumber(
      state.summaryMaxTurns,
      "Summary max turns",
    ),
    summaryMaxChars: parseGuardrailNumber(
      state.summaryMaxChars,
      "Summary max chars",
    ),
  };
};

const parseGuardrailNumber = (value: string, label: string): number => {
  if (value.trim().length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return parsed;
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const {
    loadSystemPrompt,
    loadGuardrailSettings,
    loadChatModelSettings,
    loadLangfuseSettings,
    getGuardrailDefaults,
    getChatModelDefaults,
    getLangfuseDefaults,
  } = await import("@/lib/server/chat-settings");

  // NOTE: This is a temporary measure to ensure the chat settings are created
  // if they don't exist. This should be handled more gracefully in a real app.
  try {
    await Promise.all([
      loadSystemPrompt(),
      loadGuardrailSettings(),
      loadChatModelSettings(),
      loadLangfuseSettings(),
    ]);
  } catch (err: any) {
    console.warn(
      `Error initializing chat settings, this may be expected on first run: ${err.message}`,
    );
  }
  const [promptResult, guardrailResult, modelResult, langfuseResult] =
    await Promise.all([
      loadSystemPrompt({ forceRefresh: true }),
      loadGuardrailSettings({ forceRefresh: true }),
      loadChatModelSettings({ forceRefresh: true }),
      loadLangfuseSettings({ forceRefresh: true }),
    ]);

  return {
    props: {
      systemPrompt: promptResult.prompt,
      isDefault: promptResult.isDefault,
      defaultPrompt: DEFAULT_SYSTEM_PROMPT,
      guardrails: guardrailResult,
      guardrailDefaults: getGuardrailDefaults(),
      models: modelResult,
      modelDefaults: getChatModelDefaults(),
      langfuse: langfuseResult,
      langfuseDefaults: getLangfuseDefaults(),
      tracingConfigured:
        Boolean(process.env.LANGFUSE_PUBLIC_KEY?.trim()) &&
        Boolean(process.env.LANGFUSE_SECRET_KEY?.trim()) &&
        Boolean(process.env.LANGFUSE_HOST?.trim()),
    },
  };
};

export default function ChatConfigPage({
  systemPrompt,
  isDefault,
  defaultPrompt,
  guardrails,
  guardrailDefaults,
  models,
  modelDefaults,
  langfuse,
  langfuseDefaults,
  tracingConfigured,
  error: pageError,
}: PageProps) {
  const [value, setValue] = useState(systemPrompt);
  const [savedPrompt, setSavedPrompt] = useState(systemPrompt);
  const [persistedIsDefault, setPersistedIsDefault] = useState(isDefault);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [guardrailKeywords, setGuardrailKeywords] = useState(
    guardrails.chitchatKeywords.join("\n"),
  );
  const [guardrailFallbackChitchat, setGuardrailFallbackChitchat] = useState(
    guardrails.fallbackChitchat,
  );
  const [guardrailFallbackCommand, setGuardrailFallbackCommand] = useState(
    guardrails.fallbackCommand,
  );
  const [guardrailNumeric, setGuardrailNumeric] =
    useState<GuardrailNumericFormState>(
      toNumericFormState(guardrails.numeric, guardrailDefaults.numeric),
    );
  const [savedGuardrails, setSavedGuardrails] = useState({
    keywords: guardrails.chitchatKeywords.join("\n"),
    fallbackChitchat: guardrails.fallbackChitchat,
    fallbackCommand: guardrails.fallbackCommand,
    numeric: guardrails.numeric ?? guardrailDefaults.numeric,
    isDefault: guardrails.isDefault,
  });
  const [guardrailStatus, setGuardrailStatus] = useState<SaveStatus>("idle");
  const [guardrailError, setGuardrailError] = useState<string | null>(null);
  const [modelForm, setModelForm] = useState<ModelFormState>(
    toModelFormState(models, modelDefaults),
  );
  const [savedModels, setSavedModels] = useState<ModelFormState>(
    toModelFormState(models, modelDefaults),
  );
  const [modelStatus, setModelStatus] = useState<SaveStatus>("idle");
  const [modelError, setModelError] = useState<string | null>(null);
  const [langfuseForm, setLangfuseForm] = useState<LangfuseFormState>(
    toLangfuseFormState(langfuse, langfuseDefaults),
  );
  const [savedLangfuse, setSavedLangfuse] =
    useState<LangfuseSettings>(langfuse);
  const [langfuseStatus, setLangfuseStatus] = useState<SaveStatus>("idle");
  const [langfuseError, setLangfuseError] = useState<string | null>(null);
  const llmOptions = useMemo(() => {
    if (
      !modelForm.llmModelId ||
      LLM_MODEL_OPTION_MAP.has(modelForm.llmModelId)
    ) {
      return LLM_MODEL_OPTIONS;
    }
    const fallbackProvider = LLM_MODEL_OPTIONS[0]?.provider ?? "openai";
    return [
      ...LLM_MODEL_OPTIONS,
      {
        id: modelForm.llmModelId,
        label: `${modelForm.llmModelId} (custom)`,
        provider: fallbackProvider,
        model: modelForm.llmModelId,
        aliases: [],
      },
    ];
  }, [modelForm.llmModelId]);
  const embeddingOptions = useMemo(() => {
    if (
      !modelForm.embeddingSpaceId ||
      EMBEDDING_MODEL_OPTION_MAP.has(modelForm.embeddingSpaceId)
    ) {
      return EMBEDDING_MODEL_OPTIONS;
    }
    const fallback = EMBEDDING_MODEL_OPTIONS[0];
    return [
      ...EMBEDDING_MODEL_OPTIONS,
      {
        ...fallback,
        embeddingSpaceId: modelForm.embeddingSpaceId,
        embeddingModelId: modelForm.embeddingSpaceId,
        label: `${modelForm.embeddingSpaceId} (custom)`,
      },
    ];
  }, [modelForm.embeddingSpaceId]);

  const isDirty = value !== savedPrompt;
  const isAtLimit = value.length >= SYSTEM_PROMPT_MAX_LENGTH;
  const restoreDisabled = value === defaultPrompt;
  const saveDisabled = !isDirty || status === "saving";
  const numericDirty =
    NUMERIC_NUMBER_FIELDS.some((field) => {
      const rawValue = guardrailNumeric[field];
      if (rawValue.trim().length === 0) {
        return true;
      }
      const currentValue = Number(rawValue);
      if (!Number.isFinite(currentValue)) {
        return true;
      }
      const savedValue =
        savedGuardrails.numeric[field as keyof GuardrailNumericSettings];
      return currentValue !== savedValue;
    }) ||
    guardrailNumeric.summaryEnabled !== savedGuardrails.numeric.summaryEnabled;

  const guardrailDirty =
    guardrailKeywords !== savedGuardrails.keywords ||
    guardrailFallbackChitchat !== savedGuardrails.fallbackChitchat ||
    guardrailFallbackCommand !== savedGuardrails.fallbackCommand ||
    numericDirty;
  const guardrailSaveDisabled = !guardrailDirty || guardrailStatus === "saving";
  const guardrailRestoreDisabled =
    guardrailKeywords === guardrailDefaults.chitchatKeywords.join("\n") &&
    guardrailFallbackChitchat === guardrailDefaults.fallbackChitchat &&
    guardrailFallbackCommand === guardrailDefaults.fallbackCommand &&
    NUMERIC_NUMBER_FIELDS.every((field) => {
      const currentValue = Number(guardrailNumeric[field]);
      const defaultValue =
        guardrailDefaults.numeric[field as keyof GuardrailNumericSettings];
      return Number.isFinite(currentValue) && currentValue === defaultValue;
    }) &&
    guardrailNumeric.summaryEnabled ===
      guardrailDefaults.numeric.summaryEnabled;
  const modelDirty =
    modelForm.engine !== savedModels.engine ||
    modelForm.llmModelId !== savedModels.llmModelId ||
    modelForm.embeddingSpaceId !== savedModels.embeddingSpaceId ||
    modelForm.reverseRagEnabled !== savedModels.reverseRagEnabled ||
    modelForm.reverseRagMode !== savedModels.reverseRagMode ||
    modelForm.hydeEnabled !== savedModels.hydeEnabled ||
    modelForm.rankerMode !== savedModels.rankerMode;
  const modelSaveDisabled = !modelDirty || modelStatus === "saving";
  const modelRestoreDisabled =
    modelForm.engine === modelDefaults.engine &&
    modelForm.llmModelId === modelDefaults.llmModelId &&
    modelForm.embeddingSpaceId === modelDefaults.embeddingSpaceId &&
    modelForm.reverseRagEnabled === modelDefaults.reverseRagEnabled &&
    modelForm.reverseRagMode === modelDefaults.reverseRagMode &&
    modelForm.hydeEnabled === modelDefaults.hydeEnabled &&
    modelForm.rankerMode === modelDefaults.rankerMode;
  const langfuseDirty =
    langfuseForm.envTag.trim() !== savedLangfuse.envTag ||
    Number(langfuseForm.sampleRateDev) !== savedLangfuse.sampleRateDev ||
    Number(langfuseForm.sampleRatePreview) !==
      savedLangfuse.sampleRatePreview ||
    langfuseForm.attachProviderMetadata !==
      savedLangfuse.attachProviderMetadata;
  const langfuseSaveDisabled = !langfuseDirty || langfuseStatus === "saving";
  const langfuseRestoreDisabled =
    langfuseForm.envTag === langfuseDefaults.envTag &&
    Number(langfuseForm.sampleRateDev) === langfuseDefaults.sampleRateDev &&
    Number(langfuseForm.sampleRatePreview) ===
      langfuseDefaults.sampleRatePreview &&
    langfuseForm.attachProviderMetadata ===
      langfuseDefaults.attachProviderMetadata;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(event.target.value);
      if (status === "saved" || status === "error") {
        setStatus("idle");
      }
    },
    [status],
  );

  const resetGuardrailStatus = useCallback(() => {
    if (guardrailStatus === "saved" || guardrailStatus === "error") {
      setGuardrailStatus("idle");
    }
    if (guardrailError) {
      setGuardrailError(null);
    }
  }, [guardrailError, guardrailStatus]);

  const handleGuardrailKeywordsChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setGuardrailKeywords(event.target.value);
      resetGuardrailStatus();
    },
    [resetGuardrailStatus],
  );

  const handleGuardrailFallbackChitchatChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setGuardrailFallbackChitchat(event.target.value);
      resetGuardrailStatus();
    },
    [resetGuardrailStatus],
  );

  const handleGuardrailFallbackCommandChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setGuardrailFallbackCommand(event.target.value);
      resetGuardrailStatus();
    },
    [resetGuardrailStatus],
  );

  const handleNumericFieldChange = useCallback(
    (field: Exclude<keyof GuardrailNumericFormState, "summaryEnabled">) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        setGuardrailNumeric((prev) => ({
          ...prev,
          [field]: event.target.value,
        }));
        resetGuardrailStatus();
      },
    [resetGuardrailStatus],
  );

  const handleSummaryEnabledChange = useCallback(
    (checked: boolean) => {
      setGuardrailNumeric((prev) => ({
        ...prev,
        summaryEnabled: checked,
      }));
      resetGuardrailStatus();
    },
    [resetGuardrailStatus],
  );

  const handleRestoreDefault = useCallback(() => {
    setValue(defaultPrompt);
    setError(null);
    setStatus("idle");
  }, [defaultPrompt]);

  const handleGuardrailRestoreDefaults = useCallback(() => {
    setGuardrailKeywords(guardrailDefaults.chitchatKeywords.join("\n"));
    setGuardrailFallbackChitchat(guardrailDefaults.fallbackChitchat);
    setGuardrailFallbackCommand(guardrailDefaults.fallbackCommand);
    setGuardrailNumeric(toNumericFormState(guardrailDefaults.numeric));
    setGuardrailError(null);
    setGuardrailStatus("idle");
  }, [guardrailDefaults]);

  const resetModelStatus = useCallback(() => {
    if (modelStatus === "saved" || modelStatus === "error") {
      setModelStatus("idle");
    }
    if (modelError) {
      setModelError(null);
    }
  }, [modelError, modelStatus]);

  const handleModelFieldChange = useCallback(
    (field: keyof ModelFormState) => (value: ModelFormState[typeof field]) => {
      setModelForm((prev) => {
        if (prev[field] === value) {
          return prev;
        }
        return {
          ...prev,
          [field]: value,
        };
      });
      resetModelStatus();
    },
    [resetModelStatus],
  );

  const handleModelRestoreDefaults = useCallback(() => {
    setModelForm(toModelFormState(modelDefaults));
    setModelStatus("idle");
    setModelError(null);
  }, [modelDefaults]);

  const handleLangfuseRestoreDefaults = useCallback(() => {
    setLangfuseForm(toLangfuseFormState(langfuseDefaults, langfuseDefaults));
    setLangfuseStatus("idle");
    setLangfuseError(null);
  }, [langfuseDefaults]);

  const handleLangfuseFieldChange = useCallback(
    (field: keyof Omit<LangfuseFormState, "attachProviderMetadata">) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setLangfuseForm((prev) => ({ ...prev, [field]: value }));
        if (langfuseStatus === "saved" || langfuseStatus === "error") {
          setLangfuseStatus("idle");
        }
        if (langfuseError) {
          setLangfuseError(null);
        }
      },
    [langfuseError, langfuseStatus],
  );

  const handleLangfuseToggle = useCallback(
    (checked: boolean) => {
      setLangfuseForm((prev) => ({
        ...prev,
        attachProviderMetadata: checked,
      }));
      if (langfuseStatus === "saved" || langfuseStatus === "error") {
        setLangfuseStatus("idle");
      }
      if (langfuseError) {
        setLangfuseError(null);
      }
    },
    [langfuseError, langfuseStatus],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saveDisabled) {
        return;
      }

      setStatus("saving");
      setError(null);

      try {
        const response = await fetch("/api/admin/chat-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemPrompt: value }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          const message = payload?.error ?? "Failed to save system prompt";
          throw new Error(message);
        }

        const payload = (await response.json()) as {
          systemPrompt: string;
          isDefault: boolean;
        };

        setSavedPrompt(payload.systemPrompt);
        setPersistedIsDefault(payload.isDefault);
        setValue(payload.systemPrompt);
        setStatus("saved");
      } catch (err: any) {
        console.error("[admin/chat-config] save failed", err);
        setError(err?.message ?? "Failed to save system prompt");
        setStatus("error");
      }
    },
    [saveDisabled, value],
  );

  const handleModelSave = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      if (event) {
        event.preventDefault();
      }
      if (modelSaveDisabled) {
        return;
      }

      setModelStatus("saving");
      setModelError(null);

      try {
        const response = await fetch("/api/admin/chat-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            models: {
              engine: modelForm.engine,
              llmModel: modelForm.llmModelId,
              embeddingModel: modelForm.embeddingSpaceId,
              embeddingSpaceId: modelForm.embeddingSpaceId,
              reverseRagEnabled: modelForm.reverseRagEnabled,
              reverseRagMode: modelForm.reverseRagMode,
              hydeEnabled: modelForm.hydeEnabled,
              rankerMode: modelForm.rankerMode,
            },
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          const message =
            payload?.error ?? "Failed to save chat model settings";
          throw new Error(message);
        }

        const payload = (await response.json()) as {
          models?: ChatModelSettings;
        };
        if (!payload.models) {
          throw new Error("Server did not return chat model settings.");
        }

        const normalized = toModelFormState(payload.models);
        setSavedModels(normalized);
        setModelForm(normalized);
        setModelStatus("saved");
      } catch (err: any) {
        console.error("[admin/chat-config] model save failed", err);
        setModelError(err?.message ?? "Failed to save chat model settings");
        setModelStatus("error");
      }
    },
    [modelForm, modelSaveDisabled],
  );

  const handleGuardrailSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (guardrailSaveDisabled) {
        return;
      }

      let numericPayload: GuardrailNumericSettings;
      try {
        numericPayload = parseNumericPayload(guardrailNumeric);
      } catch (err: any) {
        setGuardrailError(
          err?.message ?? "Numeric guardrail values are invalid.",
        );
        setGuardrailStatus("error");
        return;
      }

      setGuardrailStatus("saving");
      setGuardrailError(null);

      try {
        const response = await fetch("/api/admin/chat-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guardrails: {
              chitchatKeywords: guardrailKeywords,
              fallbackChitchat: guardrailFallbackChitchat,
              fallbackCommand: guardrailFallbackCommand,
              numeric: numericPayload,
            },
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          const message = payload?.error ?? "Failed to save guardrail settings";
          throw new Error(message);
        }

        const payload = (await response.json()) as {
          guardrails?: GuardrailSettingsResult;
        };

        if (!payload.guardrails) {
          throw new Error("Server did not return guardrail settings.");
        }

        setSavedGuardrails({
          keywords: guardrailKeywords,
          fallbackChitchat: guardrailFallbackChitchat,
          fallbackCommand: guardrailFallbackCommand,
          numeric: payload.guardrails.numeric ?? guardrailDefaults.numeric,
          isDefault: payload.guardrails.isDefault,
        });
        setGuardrailNumeric(
          toNumericFormState(
            payload.guardrails.numeric,
            guardrailDefaults.numeric,
          ),
        );
        setGuardrailStatus("saved");
      } catch (err: any) {
        console.error("[admin/chat-config] guardrail save failed", err);
        setGuardrailError(err?.message ?? "Failed to save guardrail settings");
        setGuardrailStatus("error");
      }
    },
    [
      guardrailDefaults,
      guardrailSaveDisabled,
      guardrailKeywords,
      guardrailFallbackChitchat,
      guardrailFallbackCommand,
      guardrailNumeric,
    ],
  );

  const parseSampleRateInput = useCallback(
    (value: string, label: string): number => {
      if (!value.trim()) {
        throw new Error(`${label} cannot be empty.`);
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${label} must be a number between 0 and 1.`);
      }
      if (parsed < 0 || parsed > 1) {
        throw new Error(`${label} must be between 0 and 1.`);
      }
      return parsed;
    },
    [],
  );

  const handleLangfuseSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (langfuseSaveDisabled) {
        return;
      }

      try {
        const envTag = langfuseForm.envTag.trim();
        if (!envTag) {
          throw new Error("Environment tag cannot be empty.");
        }
        const sampleRateDev = parseSampleRateInput(
          langfuseForm.sampleRateDev,
          "Dev sampling rate",
        );
        const sampleRatePreview = parseSampleRateInput(
          langfuseForm.sampleRatePreview,
          "Preview sampling rate",
        );
        setLangfuseStatus("saving");
        setLangfuseError(null);

        const response = await fetch("/api/admin/chat-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            langfuse: {
              envTag,
              sampleRateDev,
              sampleRatePreview,
              attachProviderMetadata: langfuseForm.attachProviderMetadata,
            },
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          const message = payload?.error ?? "Failed to save Langfuse settings";
          throw new Error(message);
        }

        const payload = (await response.json()) as {
          langfuse?: LangfuseSettings;
        };
        if (!payload.langfuse) {
          throw new Error("Server did not return Langfuse settings.");
        }
        setSavedLangfuse(payload.langfuse);
        setLangfuseForm({
          envTag: payload.langfuse.envTag,
          sampleRateDev: payload.langfuse.sampleRateDev.toString(),
          sampleRatePreview: payload.langfuse.sampleRatePreview.toString(),
          attachProviderMetadata: payload.langfuse.attachProviderMetadata,
        });
        setLangfuseStatus("saved");
      } catch (err: any) {
        console.error("[admin/chat-config] langfuse save failed", err);
        setLangfuseError(err?.message ?? "Failed to save Langfuse settings");
        setLangfuseStatus("error");
      }
    },
    [langfuseForm, langfuseSaveDisabled, parseSampleRateInput],
  );

  const helperText = useMemo(() => {
    if (status === "saved") {
      return "System prompt updated successfully.";
    }
    if (status === "error" && error) {
      return error;
    }
    if (persistedIsDefault) {
      return "Currently using the built-in default prompt. Save changes to persist a custom prompt in Supabase.";
    }
    return "Update the shared system prompt used by both LangChain and native chat engines.";
  }, [error, persistedIsDefault, status]);

  const guardrailHelperText = useMemo(() => {
    if (guardrailStatus === "saved") {
      return "Guardrail settings updated successfully.";
    }
    if (guardrailStatus === "error" && guardrailError) {
      return guardrailError;
    }
    const usingDefaults =
      savedGuardrails.isDefault.chitchatKeywords &&
      savedGuardrails.isDefault.fallbackChitchat &&
      savedGuardrails.isDefault.fallbackCommand &&
      Object.values(savedGuardrails.isDefault.numeric).every(Boolean);
    if (usingDefaults) {
      return "Currently using the default guardrail keywords and fallback guidance.";
    }
    return "Update chit-chat detection keywords and fallback guidance shared by both chat engines.";
  }, [guardrailError, guardrailStatus, savedGuardrails]);

  const modelHelperText = useMemo(() => {
    if (modelStatus === "saved") {
      return "Chat engine and model defaults updated successfully.";
    }
    if (modelStatus === "error" && modelError) {
      return modelError;
    }
    const usingDefaults =
      savedModels.engine === modelDefaults.engine &&
      savedModels.llmModelId === modelDefaults.llmModelId &&
      savedModels.embeddingSpaceId === modelDefaults.embeddingSpaceId &&
      savedModels.reverseRagEnabled === modelDefaults.reverseRagEnabled &&
      savedModels.reverseRagMode === modelDefaults.reverseRagMode &&
      savedModels.hydeEnabled === modelDefaults.hydeEnabled &&
      savedModels.rankerMode === modelDefaults.rankerMode;
    if (usingDefaults) {
      return "Currently using environment defaults for engine and model selection.";
    }
    return "Choose the chat engine, LLM model, and embedding space used by the Chat Panel.";
  }, [
    modelDefaults.embeddingSpaceId,
    modelDefaults.engine,
    modelDefaults.llmModelId,
    modelDefaults.hydeEnabled,
    modelDefaults.rankerMode,
    modelDefaults.reverseRagEnabled,
    modelDefaults.reverseRagMode,
    modelError,
    modelStatus,
    savedModels.embeddingSpaceId,
    savedModels.engine,
    savedModels.llmModelId,
    savedModels.hydeEnabled,
    savedModels.rankerMode,
    savedModels.reverseRagEnabled,
    savedModels.reverseRagMode,
  ]);

  const langfuseHelperText = useMemo(() => {
    if (langfuseStatus === "saved") {
      return "Langfuse settings updated successfully.";
    }
    if (langfuseStatus === "error" && langfuseError) {
      return langfuseError;
    }
    if (
      savedLangfuse.isDefault.envTag &&
      savedLangfuse.isDefault.sampleRateDev &&
      savedLangfuse.isDefault.sampleRatePreview &&
      savedLangfuse.isDefault.attachProviderMetadata
    ) {
      return "Currently using environment defaults for Langfuse tagging and sampling.";
    }
    return "Control how traces are tagged and sampled before reaching Langfuse.";
  }, [langfuseError, langfuseStatus, savedLangfuse]);

  return (
    <>
      <Head>
        <title>Chat Configuration · Admin</title>
      </Head>

      <main className="chat-config-page">
        <div className="chat-config-shell">
          <header className="chat-config__header">
            <Link href="/admin/ingestion">
              <Button
                size="icon"
                variant="outline"
                className="show-mobile"
                aria-label="Back to ingestion dashboard"
              >
                <ArrowLeft className="chat-icon" aria-hidden="true" />
              </Button>
            </Link>
            <div className="chat-config__title">
              <p className="chat-eyebrow">Admin</p>
              <h1>Chat Configuration</h1>
              <p>
                Fine-tune prompts, guardrails, models, and tracing shared by the
                Chat Panel.
              </p>
            </div>
            <Link href="/admin/ingestion">
              <Button variant="outline" className="hide-mobile">
                <ArrowLeft className="chat-btn__icon" aria-hidden="true" />
                Ingestion Dashboard
              </Button>
            </Link>
          </header>

          <div className="chat-config__grid">
            {pageError && (
              <Card tone="danger">
                <CardHeader>
                  <CardTitle>
                    <span className="chat-card__title-icon" aria-hidden="true">
                      <AlertTriangle />
                    </span>
                    Page Error
                  </CardTitle>
                  <CardDescription>{pageError}</CardDescription>
                </CardHeader>
              </Card>
            )}
            <form className="chat-card-form" onSubmit={handleSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle>System Prompt</CardTitle>
                  <CardDescription>{helperText}</CardDescription>
                </CardHeader>
                <CardContent className="chat-stack">
                  <textarea
                    id="systemPrompt"
                    name="systemPrompt"
                    value={value}
                    onChange={handleChange}
                    rows={8}
                    spellCheck={false}
                    maxLength={SYSTEM_PROMPT_MAX_LENGTH}
                    className="chat-textarea chat-textarea--prompt"
                  />
                  <div className="chat-charcount">
                    <span
                      className={cx(
                        "chat-charcount__value",
                        isAtLimit && "is-critical",
                      )}
                    >
                      {value.length.toLocaleString()} /{" "}
                      {SYSTEM_PROMPT_MAX_LENGTH.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRestoreDefault}
                    disabled={restoreDisabled}
                  >
                    Restore Default
                  </Button>
                  <Button type="submit" disabled={saveDisabled}>
                    {status === "saving" ? "Saving..." : "Save Prompt"}
                    {status !== "saving" && (
                      <Save className="chat-btn__icon" aria-hidden="true" />
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>

            <form className="chat-card-form" onSubmit={handleGuardrailSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle>Guardrails</CardTitle>
                  <CardDescription>{guardrailHelperText}</CardDescription>
                </CardHeader>
                <CardContent className="chat-stack">
                  <div className="chat-grid chat-grid--two">
                    <div className="chat-field">
                      <label className="chat-label" htmlFor="guardrailKeywords">
                        Chit-chat keywords
                      </label>
                      <textarea
                        id="guardrailKeywords"
                        className="chat-textarea"
                        value={guardrailKeywords}
                        onChange={handleGuardrailKeywordsChange}
                        rows={6}
                        spellCheck={false}
                      />
                      <p className="chat-helper">
                        Enter one keyword per line. Matches trigger the fallback
                        chit-chat guidance below.
                      </p>
                    </div>
                    <div className="chat-stack">
                      <div className="chat-field">
                        <label
                          className="chat-label"
                          htmlFor="guardrailFallbackChitchat"
                        >
                          Fallback chit-chat response
                        </label>
                        <textarea
                          id="guardrailFallbackChitchat"
                          className="chat-textarea"
                          value={guardrailFallbackChitchat}
                          onChange={handleGuardrailFallbackChitchatChange}
                          rows={4}
                          spellCheck={false}
                        />
                        <p className="chat-helper">
                          Used when chit-chat keywords are detected to redirect
                          users back to the assistant&apos;s scope.
                        </p>
                      </div>
                      <div className="chat-field">
                        <label
                          className="chat-label"
                          htmlFor="guardrailFallbackCommand"
                        >
                          Fallback command response
                        </label>
                        <textarea
                          id="guardrailFallbackCommand"
                          className="chat-textarea"
                          value={guardrailFallbackCommand}
                          onChange={handleGuardrailFallbackCommandChange}
                          rows={4}
                          spellCheck={false}
                        />
                        <p className="chat-helper">
                          Sent when chat requests look like shell or system
                          commands.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="chat-grid chat-grid--three">
                    <div className="chat-field">
                      <label
                        className="chat-label"
                        htmlFor="guardrailSimilarityThreshold"
                      >
                        Similarity threshold
                      </label>
                      <input
                        id="guardrailSimilarityThreshold"
                        className="chat-input"
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={guardrailNumeric.similarityThreshold}
                        onChange={handleNumericFieldChange(
                          "similarityThreshold",
                        )}
                      />
                      <p className="chat-helper">
                        Minimum cosine similarity (0-1) for a chunk to be
                        considered relevant.
                      </p>
                    </div>
                    <div className="chat-field">
                      <label className="chat-label" htmlFor="guardrailRagTopK">
                        RAG top K
                      </label>
                      <input
                        id="guardrailRagTopK"
                        className="chat-input"
                        type="number"
                        min="1"
                        step="1"
                        value={guardrailNumeric.ragTopK}
                        onChange={handleNumericFieldChange("ragTopK")}
                      />
                      <p className="chat-helper">
                        Number of matching chunks to retrieve for each question.
                      </p>
                    </div>
                    <div className="chat-field">
                      <label
                        className="chat-label"
                        htmlFor="guardrailContextBudget"
                      >
                        Context token budget
                      </label>
                      <input
                        id="guardrailContextBudget"
                        className="chat-input"
                        type="number"
                        min="1"
                        value={guardrailNumeric.ragContextTokenBudget}
                        onChange={handleNumericFieldChange(
                          "ragContextTokenBudget",
                        )}
                      />
                      <p className="chat-helper">
                        Maximum tokens reserved for retrieved context.
                      </p>
                    </div>
                    <div className="chat-field">
                      <label
                        className="chat-label"
                        htmlFor="guardrailContextClip"
                      >
                        Context clip tokens
                      </label>
                      <input
                        id="guardrailContextClip"
                        className="chat-input"
                        type="number"
                        min="1"
                        value={guardrailNumeric.ragContextClipTokens}
                        onChange={handleNumericFieldChange(
                          "ragContextClipTokens",
                        )}
                      />
                      <p className="chat-helper">
                        Clips long chunks to this many tokens before sending to
                        the LLM.
                      </p>
                    </div>
                    <div className="chat-field">
                      <label
                        className="chat-label"
                        htmlFor="guardrailHistoryBudget"
                      >
                        History token budget
                      </label>
                      <input
                        id="guardrailHistoryBudget"
                        className="chat-input"
                        type="number"
                        min="0"
                        value={guardrailNumeric.historyTokenBudget}
                        onChange={handleNumericFieldChange(
                          "historyTokenBudget",
                        )}
                      />
                      <p className="chat-helper">
                        Tokens reserved for prior conversation messages.
                      </p>
                    </div>
                  </div>

                  <div className="chat-stack">
                    <div className="chat-toggle-row">
                      <Switch
                        id="guardrailSummaryEnabled"
                        checked={guardrailNumeric.summaryEnabled}
                        onCheckedChange={handleSummaryEnabledChange}
                        aria-labelledby="guardrailSummaryEnabled-label"
                      />
                      <div>
                        <p
                          id="guardrailSummaryEnabled-label"
                          className="chat-toggle__title"
                        >
                          Conversation summaries
                        </p>
                        <p className="chat-helper">
                          Automatically summarize history once it exceeds the
                          configured limits.
                        </p>
                      </div>
                    </div>
                    <div className="chat-grid chat-grid--three">
                      <div className="chat-field">
                        <label
                          className="chat-label"
                          htmlFor="guardrailSummaryTrigger"
                        >
                          Summary trigger tokens
                        </label>
                        <input
                          id="guardrailSummaryTrigger"
                          className="chat-input"
                          type="number"
                          min="50"
                          value={guardrailNumeric.summaryTriggerTokens}
                          onChange={handleNumericFieldChange(
                            "summaryTriggerTokens",
                          )}
                          disabled={!guardrailNumeric.summaryEnabled}
                        />
                        <p className="chat-helper">
                          When history exceeds this many tokens, summarization
                          runs.
                        </p>
                      </div>
                      <div className="chat-field">
                        <label
                          className="chat-label"
                          htmlFor="guardrailSummaryTurns"
                        >
                          Summary max turns
                        </label>
                        <input
                          id="guardrailSummaryTurns"
                          className="chat-input"
                          type="number"
                          min="1"
                          step="1"
                          value={guardrailNumeric.summaryMaxTurns}
                          onChange={handleNumericFieldChange("summaryMaxTurns")}
                          disabled={!guardrailNumeric.summaryEnabled}
                        />
                        <p className="chat-helper">
                          Limits how many recent exchanges are preserved
                          verbatim.
                        </p>
                      </div>
                      <div className="chat-field">
                        <label
                          className="chat-label"
                          htmlFor="guardrailSummaryChars"
                        >
                          Summary max characters
                        </label>
                        <input
                          id="guardrailSummaryChars"
                          className="chat-input"
                          type="number"
                          min="100"
                          value={guardrailNumeric.summaryMaxChars}
                          onChange={handleNumericFieldChange("summaryMaxChars")}
                          disabled={!guardrailNumeric.summaryEnabled}
                        />
                        <p className="chat-helper">
                          Caps summary length independent of token limits.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGuardrailRestoreDefaults}
                    disabled={guardrailRestoreDisabled}
                  >
                    Restore Defaults
                  </Button>
                  <Button type="submit" disabled={guardrailSaveDisabled}>
                    {guardrailStatus === "saving"
                      ? "Saving..."
                      : "Save Guardrails"}
                    {guardrailStatus !== "saving" && (
                      <Save className="chat-btn__icon" aria-hidden="true" />
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>

            <form className="chat-card-form" onSubmit={handleModelSave}>
              <Card>
                <CardHeader>
                  <CardTitle>Engine &amp; Model Defaults</CardTitle>
                  <CardDescription>{modelHelperText}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="chat-grid chat-grid--three">
                    <div className="chat-field">
                      <label className="chat-label" htmlFor="chatEngine">
                        Chat engine
                      </label>
                      <select
                        id="chatEngine"
                        className="chat-input chat-input--select"
                        value={modelForm.engine}
                        onChange={(event) =>
                          handleModelFieldChange("engine")(
                            event.target.value as ModelFormState["engine"],
                          )
                        }
                      >
                        <option value="lc">LangChain</option>
                        <option value="native">Native</option>
                      </select>
                      <p className="chat-helper">
                        Applies globally; Chat Panel uses this engine.
                      </p>
                    </div>
                    <div className="chat-field">
                      <label className="chat-label" htmlFor="llmModel">
                        LLM model
                      </label>
                      <select
                        id="llmModel"
                        className="chat-input chat-input--select"
                        value={modelForm.llmModelId}
                        onChange={(event) =>
                          handleModelFieldChange("llmModelId")(
                            event.target.value,
                          )
                        }
                      >
                        {llmOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="chat-helper">
                        Determines which provider and model generate chat
                        responses.
                      </p>
                    </div>
                    <div className="chat-field">
                      <label className="chat-label" htmlFor="embeddingModel">
                        Embedding model
                      </label>
                      <select
                        id="embeddingModel"
                        className="chat-input chat-input--select"
                        value={modelForm.embeddingSpaceId}
                        onChange={(event) =>
                          handleModelFieldChange("embeddingSpaceId")(
                            event.target.value,
                          )
                        }
                      >
                        {embeddingOptions.map((option) => (
                          <option
                            key={option.embeddingSpaceId}
                            value={option.embeddingSpaceId}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="chat-helper">
                        Must match the embedding space used when ingesting your
                        content.
                      </p>
                    </div>
                  </div>

                  <div className="chat-stack">
                    <div className="chat-toggle-row">
                      <Switch
                        id="reverseRagEnabled"
                        checked={modelForm.reverseRagEnabled}
                        onCheckedChange={(checked) =>
                          handleModelFieldChange("reverseRagEnabled")(checked)
                        }
                        aria-labelledby="reverseRagEnabled-label"
                      />
                      <div>
                        <p
                          id="reverseRagEnabled-label"
                          className="chat-toggle__title"
                        >
                          Reverse RAG (query rewriting)
                        </p>
                        <p className="chat-helper">
                          Rewrite the user question before retrieval to improve
                          precision or recall.
                        </p>
                      </div>
                    </div>
                    <div className="chat-grid chat-grid--two">
                      <div className="chat-field">
                        <label className="chat-label" htmlFor="reverseRagMode">
                          Reverse RAG mode
                        </label>
                        <select
                          id="reverseRagMode"
                          className="chat-input chat-input--select"
                          value={modelForm.reverseRagMode}
                          disabled={!modelForm.reverseRagEnabled}
                          onChange={(event) =>
                            handleModelFieldChange("reverseRagMode")(
                              event.target.value as ReverseRagMode,
                            )
                          }
                        >
                          {REVERSE_RAG_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {REVERSE_RAG_MODE_LABELS[mode]}
                            </option>
                          ))}
                        </select>
                        <p className="chat-helper">
                          Choose whether the rewrite stays narrow (precision) or
                          broadens recall.
                        </p>
                      </div>
                      <div className="chat-field">
                        <label className="chat-label" htmlFor="rankerMode">
                          Post-retrieval ranker
                        </label>
                        <select
                          id="rankerMode"
                          className="chat-input chat-input--select"
                          value={modelForm.rankerMode}
                          onChange={(event) =>
                            handleModelFieldChange("rankerMode")(
                              event.target.value as RankerMode,
                            )
                          }
                        >
                          {RANKER_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {RANKER_MODE_LABELS[mode]}
                            </option>
                          ))}
                        </select>
                        <p className="chat-helper">
                          Re-rank retrieved passages before grounding answers.
                        </p>
                      </div>
                    </div>
                    <div className="chat-toggle-row">
                      <Switch
                        id="hydeEnabled"
                        checked={modelForm.hydeEnabled}
                        onCheckedChange={(checked) =>
                          handleModelFieldChange("hydeEnabled")(checked)
                        }
                        aria-labelledby="hydeEnabled-label"
                      />
                      <div>
                        <p
                          id="hydeEnabled-label"
                          className="chat-toggle__title"
                        >
                          HyDE (hypothetical docs)
                        </p>
                        <p className="chat-helper">
                          Generate a short hypothetical doc and index its
                          embedding instead of the raw query.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleModelRestoreDefaults}
                    disabled={modelRestoreDisabled}
                  >
                    Restore Defaults
                  </Button>
                  <Button type="submit" disabled={modelSaveDisabled}>
                    {modelStatus === "saving" ? "Saving..." : "Save Models"}
                    {modelStatus !== "saving" && (
                      <Save className="chat-btn__icon" aria-hidden="true" />
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>

            <form className="chat-card-form" onSubmit={handleLangfuseSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle>Langfuse Tracing</CardTitle>
                  <CardDescription>{langfuseHelperText}</CardDescription>
                  <div
                    className={cx(
                      "chat-inline-alert",
                      tracingConfigured ? "is-success" : "is-warning",
                    )}
                  >
                    {tracingConfigured ? (
                      <CheckCircle aria-hidden="true" />
                    ) : (
                      <AlertTriangle aria-hidden="true" />
                    )}
                    <span>
                      {tracingConfigured
                        ? "Langfuse keys detected from the environment."
                        : "Langfuse keys missing; tracing will remain disabled until keys are provided."}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="chat-grid chat-grid--three">
                    <div className="chat-field">
                      <label className="chat-label" htmlFor="langfuseEnv">
                        Environment tag
                      </label>
                      <input
                        id="langfuseEnv"
                        className="chat-input"
                        type="text"
                        value={langfuseForm.envTag}
                        onChange={handleLangfuseFieldChange("envTag")}
                      />
                      <p className="chat-helper">
                        Stored with each trace to distinguish dev, preview, or
                        prod traffic.
                      </p>
                    </div>
                    <div className="chat-field">
                      <label className="chat-label" htmlFor="langfuseSampleDev">
                        Dev sampling rate
                      </label>
                      <input
                        id="langfuseSampleDev"
                        className="chat-input"
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={langfuseForm.sampleRateDev}
                        onChange={handleLangfuseFieldChange("sampleRateDev")}
                      />
                      <p className="chat-helper">
                        Fraction of dev requests captured (0–1).
                      </p>
                    </div>
                    <div className="chat-field">
                      <label
                        className="chat-label"
                        htmlFor="langfuseSamplePreview"
                      >
                        Preview sampling rate
                      </label>
                      <input
                        id="langfuseSamplePreview"
                        className="chat-input"
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={langfuseForm.sampleRatePreview}
                        onChange={handleLangfuseFieldChange(
                          "sampleRatePreview",
                        )}
                      />
                      <p className="chat-helper">
                        Fraction of preview deployments captured (0–1).
                      </p>
                    </div>
                    <div className="chat-toggle-row chat-toggle-row--inline">
                      <Switch
                        id="langfuseProviderMeta"
                        checked={langfuseForm.attachProviderMetadata}
                        onCheckedChange={handleLangfuseToggle}
                        aria-labelledby="langfuseProviderMeta-label"
                      />
                      <div>
                        <p
                          id="langfuseProviderMeta-label"
                          className="chat-toggle__title"
                        >
                          Attach provider metadata
                        </p>
                        <p className="chat-helper">
                          Includes provider-specific request IDs for easier
                          debugging.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLangfuseRestoreDefaults}
                    disabled={langfuseRestoreDisabled}
                  >
                    Restore Defaults
                  </Button>
                  <Button type="submit" disabled={langfuseSaveDisabled}>
                    {langfuseStatus === "saving"
                      ? "Saving..."
                      : "Save Langfuse"}
                    {langfuseStatus !== "saving" && (
                      <Save className="chat-btn__icon" aria-hidden="true" />
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </div>
        </div>
      </main>
      <style jsx>{styles}</style>
    </>
  );
}

const styles = css.global`
  :root {
    --chat-admin-bg: var(--bg-color, #f9f8f6);
    --chat-admin-border: rgba(55, 53, 47, 0.14);
    --chat-admin-muted: rgba(55, 53, 47, 0.65);
    --chat-admin-strong: rgba(28, 27, 25, 0.95);
    --chat-admin-card-bg: rgba(255, 255, 255, 0.96);
    --chat-admin-accent: #2d6cdf;
  }

  .chat-config-page {
    min-height: 100vh;
    background:
      radial-gradient(circle at top, rgba(45, 108, 223, 0.08), transparent 48%),
      var(--chat-admin-bg);
    padding: clamp(1.5rem, 5vw, 4rem) 0 4rem;
  }

  .chat-config-shell {
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: 0 clamp(1.25rem, 4vw, 3rem);
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .chat-config__header {
    display: flex;
    align-items: center;
    gap: 1rem;
    border-bottom: 1px solid var(--chat-admin-border);
    padding-bottom: 1.5rem;
  }

  .chat-config__title {
    flex: 1;
  }

  .chat-config__title h1 {
    margin: 0;
    font-size: clamp(1.75rem, 4vw, 2.45rem);
    color: var(--chat-admin-strong);
  }

  .chat-config__title p {
    margin: 0.35rem 0 0;
    color: var(--chat-admin-muted);
    max-width: 60ch;
    line-height: 1.5;
  }

  .chat-eyebrow {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    margin: 0 0 0.4rem;
    color: rgba(55, 53, 47, 0.5);
  }

  .chat-config__grid {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .chat-card {
    border-radius: 22px;
    border: 1px solid var(--chat-admin-border);
    background: var(--chat-admin-card-bg);
    box-shadow: 0 20px 55px rgba(15, 14, 12, 0.08);
    backdrop-filter: blur(8px);
  }

  .chat-card--danger {
    border-color: rgba(219, 68, 55, 0.35);
    background: rgba(219, 68, 55, 0.08);
  }

  .chat-card__header,
  .chat-card__content,
  .chat-card__footer {
    padding: clamp(1.25rem, 3vw, 2rem);
  }

  .chat-card__header {
    border-bottom: 1px solid rgba(55, 53, 47, 0.08);
    padding-bottom: clamp(1rem, 2vw, 1.4rem);
  }

  .chat-card__content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .chat-card__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    border-top: 1px solid rgba(55, 53, 47, 0.08);
    flex-wrap: wrap;
  }

  .chat-card__title {
    margin: 0;
    font-size: 1.35rem;
    color: var(--chat-admin-strong);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chat-card__description {
    margin: 0.35rem 0 0;
    color: var(--chat-admin-muted);
    line-height: 1.5;
  }

  .chat-card__title-icon {
    width: 1.25rem;
    height: 1.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #d92c20;
  }

  .chat-card-form {
    width: 100%;
  }

  .chat-stack {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .chat-grid {
    display: grid;
    gap: 1.25rem;
  }

  .chat-grid--two {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .chat-grid--three {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .chat-field {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .chat-label {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--chat-admin-strong);
  }

  .chat-helper {
    margin: 0;
    font-size: 0.85rem;
    color: var(--chat-admin-muted);
    line-height: 1.45;
  }

  .chat-input,
  .chat-textarea,
  .chat-input--select {
    border: 1px solid rgba(55, 53, 47, 0.18);
    border-radius: 14px;
    padding: 0.75rem 0.95rem;
    font-size: 1rem;
    font-family: inherit;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      background 0.2s ease;
    background: rgba(255, 255, 255, 0.95);
    color: var(--chat-admin-strong);
  }

  .chat-input:focus,
  .chat-textarea:focus,
  .chat-input--select:focus {
    outline: none;
    border-color: var(--chat-admin-accent);
    box-shadow: 0 0 0 3px rgba(45, 108, 223, 0.18);
    background: #fff;
  }

  .chat-input--select {
    appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg fill='none' stroke='rgba(55,53,47,0.55)' stroke-width='1.5' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'><path d='M6 9l6 6 6-6'/></svg>");
    background-repeat: no-repeat;
    background-position: right 0.9rem center;
    padding-right: 2.4rem;
    background-size: 1rem;
  }

  .chat-textarea {
    resize: vertical;
    min-height: 8rem;
  }

  .chat-textarea--prompt {
    min-height: 18rem;
  }

  .chat-charcount {
    display: flex;
    justify-content: flex-end;
    font-size: 0.9rem;
    color: var(--chat-admin-muted);
  }

  .chat-charcount__value.is-critical {
    color: #d92c20;
    font-weight: 600;
  }

  .chat-btn {
    border-radius: 999px;
    border: none;
    font-weight: 600;
    letter-spacing: 0.01em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      box-shadow 0.2s ease,
      background 0.2s ease;
  }

  .chat-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }

  .chat-btn--variant-default {
    background: linear-gradient(120deg, #2d6cdf, #5f8fff);
    color: #fff;
    box-shadow: 0 14px 28px rgba(45, 108, 223, 0.25);
  }

  .chat-btn--variant-default:not(:disabled):hover {
    transform: translateY(-1px);
    box-shadow: 0 18px 32px rgba(45, 108, 223, 0.3);
  }

  .chat-btn--variant-outline {
    border: 1px solid var(--chat-admin-border);
    background: transparent;
    color: var(--chat-admin-strong);
  }

  .chat-btn--variant-outline:not(:disabled):hover {
    border-color: var(--chat-admin-accent);
    color: var(--chat-admin-accent);
  }

  .chat-btn--variant-ghost {
    background: transparent;
    color: var(--chat-admin-muted);
  }

  .chat-btn--size-default {
    min-height: 44px;
    padding: 0 1.5rem;
    font-size: 0.95rem;
  }

  .chat-btn--size-sm {
    min-height: 36px;
    padding: 0 1.1rem;
    font-size: 0.85rem;
  }

  .chat-btn--size-lg {
    min-height: 48px;
    padding: 0 1.85rem;
  }

  .chat-btn--size-icon {
    width: 42px;
    height: 42px;
    padding: 0;
  }

  .chat-btn__icon {
    width: 1rem;
    height: 1rem;
    margin-left: 0.4rem;
  }

  .chat-icon {
    width: 1.1rem;
    height: 1.1rem;
  }

  .show-mobile {
    display: inline-flex;
  }

  .hide-mobile {
    display: none;
  }

  @media (min-width: 640px) {
    .show-mobile {
      display: none !important;
    }

    .hide-mobile {
      display: inline-flex !important;
    }
  }

  .chat-toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-radius: 16px;
    border: 1px solid rgba(55, 53, 47, 0.12);
    background: rgba(255, 255, 255, 0.92);
  }

  .chat-toggle-row--inline {
    align-items: center;
  }

  .chat-toggle__title {
    margin: 0;
    font-weight: 600;
    color: var(--chat-admin-strong);
  }

  .chat-inline-alert {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.9rem;
    margin-top: 0.75rem;
  }

  .chat-inline-alert svg {
    width: 1rem;
    height: 1rem;
  }

  .chat-inline-alert.is-success {
    color: #1f7a4d;
  }

  .chat-inline-alert.is-warning {
    color: #8f5606;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 720px) {
    .chat-card__footer {
      flex-direction: column;
      align-items: stretch;
    }

    .chat-btn {
      width: 100%;
      justify-content: center;
    }
  }
`;
