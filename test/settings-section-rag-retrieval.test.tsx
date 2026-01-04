import assert from "node:assert";
import { test } from "node:test";

import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react-dom/test-utils";

import type {
  AdminChatConfig,
  AdminChatRuntimeMeta,
  AdminPresetConfig,
  ModelResolution,
  SessionChatConfig,
} from "@/types/chat-config";
import { ChatConfigContext } from "@/components/chat/context/ChatConfigContext";
import { AdvancedSettingsPresetEffects } from "@/components/chat/settings/AdvancedSettingsPresetEffects";
import {
  buildEffectiveSettingsPayload,
  buildEffectiveSettingsSupportLine,
} from "@/components/chat/settings/effective-settings";
import { computeOverridesActive } from "@/components/chat/settings/preset-overrides";
import { SettingsSectionOptionalOverrides } from "@/components/chat/settings/SettingsSectionOptionalOverrides";
import { SettingsSectionRagRetrieval } from "@/components/chat/settings/SettingsSectionRagRetrieval";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const globalAny = globalThis as Record<string, any>;
globalAny.window = dom.window;
globalAny.document = dom.window.document;

const createModelResolution = (modelId: string): ModelResolution => ({
  requestedModelId: modelId,
  resolvedModelId: modelId,
  wasSubstituted: false,
  reason: "NONE",
});

const createAdminConfig = (): AdminChatConfig => {
  const presetBase: AdminPresetConfig = {
    additionalSystemPrompt: "",
    llmModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    rag: {
      enabled: true,
      topK: 3,
      similarity: 0.5,
    },
    context: {
      enabled: true,
      tokenBudget: 2048,
      historyBudget: 1024,
      clipTokens: 128,
    },
    features: {
      reverseRAG: false,
      hyde: false,
      ranker: "none",
    },
    summaryLevel: "off",
    safeMode: false,
    requireLocal: false,
  };

  const presets = {
    default: presetBase,
    fast: presetBase,
    highRecall: presetBase,
    precision: presetBase,
  };

  const config: AdminChatConfig = {
    baseSystemPrompt: "",
    baseSystemPromptSummary: "",
    additionalPromptMaxLength: 500,
    hydeMode: "off",
    rewriteMode: "off",
    ragMultiQueryMode: "off",
    ragMultiQueryMaxQueries: 1,
    numericLimits: {
      ragTopK: { min: 1, max: 20, default: 3 },
      similarityThreshold: { min: 0, max: 1, default: 0.5 },
      contextBudget: { min: 512, max: 4096, default: 2048 },
      historyBudget: { min: 256, max: 4096, default: 1024 },
      clipTokens: { min: 32, max: 4096, default: 128 },
    },
    allowlist: {
      llmModels: ["gpt-4o-mini"],
      embeddingModels: ["text-embedding-3-small"],
      rankers: ["none", "mmr", "cohere-rerank"],
      allowReverseRAG: true,
      allowHyde: true,
    },
    guardrails: {
      chitchatKeywords: [],
      fallbackChitchat: "",
      fallbackCommand: "",
    },
    summaryPresets: {
      low: { every_n_turns: 2 },
      medium: { every_n_turns: 4 },
      high: { every_n_turns: 6 },
    },
    presets: presets as AdminChatConfig["presets"],
    telemetry: {
      sampleRate: 0,
      detailLevel: "minimal",
    },
    cache: {
      responseTtlSeconds: 0,
      retrievalTtlSeconds: 0,
    },
  };

  return config;
};

const createSessionConfig = (): SessionChatConfig => ({
  llmModel: "gpt-4o-mini",
  embeddingModel: "text-embedding-3-small",
  rag: {
    enabled: true,
    topK: 6,
    similarity: 0.4,
  },
  context: {
    enabled: true,
    tokenBudget: 2048,
    historyBudget: 1024,
    clipTokens: 128,
  },
  features: {
    reverseRAG: true,
    hyde: false,
    ranker: "none",
  },
  summaryLevel: "low",
  appliedPreset: "default",
  additionalSystemPrompt: "",
  safeMode: false,
  requireLocal: false,
});

const createRuntimeMeta = (
  adminConfig: AdminChatConfig,
): AdminChatRuntimeMeta => {
  const presetKeys = Object.keys(adminConfig.presets) as Array<
    keyof AdminChatConfig["presets"]
  >;
  const presetResolutions = presetKeys.reduce(
    (acc, key) => ({
      ...acc,
      [key]: createModelResolution(adminConfig.presets[key].llmModel),
    }),
    {} as Record<keyof AdminChatConfig["presets"], ModelResolution>,
  );
  return {
    defaultLlmModelId: adminConfig.presets.default.llmModel,
    defaultLlmModelExplicit: true,
    ollamaConfigured: false,
    lmstudioConfigured: false,
    localLlmBackendEnv: null,
    presetResolutions,
  };
};

const renderRagContent = (locked: boolean) => {
  const adminConfig = createAdminConfig();
  const sessionConfig = createSessionConfig();
  return renderToStaticMarkup(
    <SettingsSectionRagRetrieval
      adminConfig={adminConfig}
      sessionConfig={sessionConfig}
      setSessionConfig={() => undefined}
      isRagLockedOverride={locked}
    />,
  );
};

void test("locked retrieval hides sliders and shows preset note", () => {
  const markup = renderRagContent(true);
  assert.ok(
    markup.includes("Retrieval settings are managed by the selected preset"),
  );
  assert.ok(!markup.includes('id="settings-top-k"'));
});

void test("unlocked retrieval shows sliders and hides summary", () => {
  const markup = renderRagContent(false);
  assert.ok(!markup.includes("Preset Effects (Managed by Preset)"));
  assert.ok(markup.includes('id="settings-top-k"'));
});

void test("preset effects card surfaces managed values once", () => {
  const adminConfig = createAdminConfig();
  const sessionConfig = createSessionConfig();
  const markup = renderToStaticMarkup(
    <AdvancedSettingsPresetEffects
      adminConfig={adminConfig}
      sessionConfig={sessionConfig}
    />,
  );
  assert.ok(markup.includes("Preset Effects (Managed by Preset)"));
  assert.ok(markup.includes("Retrieval: enabled"));
  assert.ok(markup.includes("Ranker: None"));
  assert.ok(markup.includes("Memory: context"));
  assert.ok(markup.includes("Summaries (preset default): Low"));
});

void test("effective settings payload includes key fields", () => {
  const adminConfig = createAdminConfig();
  const sessionConfig = createSessionConfig();
  const overridesActive = computeOverridesActive({
    adminConfig,
    sessionConfig,
  });
  const payload = buildEffectiveSettingsPayload({
    adminConfig,
    sessionConfig,
    overridesActive,
    effectiveEmbeddingLabel: "text-embedding-3-small",
    timestamp: "2025-01-01T00:00:00.000Z",
  });

  assert.strictEqual(payload.generatedAt, "2025-01-01T00:00:00.000Z");
  assert.strictEqual(payload.retrieval.topK, sessionConfig.rag.topK);
  assert.strictEqual(
    payload.retrieval.ranker.raw,
    sessionConfig.features.ranker,
  );
  assert.strictEqual(payload.summaries.current, "Low");
  assert.strictEqual(payload.userPrompt.present, false);
  assert.strictEqual(payload.schemaVersion, 1);
});

void test("support line contains summary keys", () => {
  const adminConfig = createAdminConfig();
  const sessionConfig = createSessionConfig();
  const overridesActive = computeOverridesActive({
    adminConfig,
    sessionConfig,
  });
  const payload = buildEffectiveSettingsPayload({
    adminConfig,
    sessionConfig,
    overridesActive,
    effectiveEmbeddingLabel: "text-embedding-3-small",
    timestamp: "2025-01-01T00:00:00.000Z",
  });

  const supportLine = buildEffectiveSettingsSupportLine(payload);
  assert.ok(supportLine.includes("Preset=Balanced (Default)"));
  assert.ok(supportLine.includes("LLM=gpt-4o-mini"));
  assert.ok(supportLine.includes("Retrieval=on topK=6 sim>=0.40"));
  assert.ok(supportLine.includes("Budgets=ctx2048 hist1024 clip128"));
  assert.ok(supportLine.includes("Summaries=preset:Low current:Low"));
  assert.ok(supportLine.includes("Prompt=absent"));
});

void test("optional overrides clear appliedPreset on change", () => {
  const adminConfig = createAdminConfig();
  const sessionConfig = createSessionConfig();
  const updates: SessionChatConfig[] = [];

  const setSessionConfig = (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => {
    if (typeof value === "function") {
      updates.push(value(sessionConfig));
    } else {
      updates.push(value);
    }
  };

  const runtimeMeta = createRuntimeMeta(adminConfig);

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ChatConfigContext.Provider
        value={{
          adminConfig,
          runtimeMeta,
          sessionConfig,
          setSessionConfig,
        }}
      >
        <SettingsSectionOptionalOverrides
          adminConfig={adminConfig}
          sessionConfig={sessionConfig}
          setSessionConfig={setSessionConfig}
          onResetToPresetDefaults={() => undefined}
        />
      </ChatConfigContext.Provider>,
    );
  });

  const select = container.querySelector<HTMLSelectElement>(
    "#optional-llm-model",
  );
  if (!select) {
    throw new Error("LLM model select not rendered");
  }

  act(() => {
    select.value = adminConfig.allowlist.llmModels[0];
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].appliedPreset, undefined);

  act(() => {
    root.unmount();
  });
});
