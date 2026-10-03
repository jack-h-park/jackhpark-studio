import assert from "node:assert/strict";
import test from "node:test";

import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import type {
  AdminChatConfig,
  AdminChatRuntimeMeta,
  AdminPresetConfig,
  SessionChatConfig,
} from "@/types/chat-config";
import {
  ChatConfigProvider,
  useChatConfig,
} from "@/components/chat/context/ChatConfigContext";
import { ChatAdvancedSettingsDrawer } from "@/components/chat/settings/ChatAdvancedSettingsDrawer";
import {
  computeOverridesActive,
  createSessionOverrideUpdater,
} from "@/components/chat/settings/preset-overrides";
import { PresetSelectorTabs } from "@/components/chat/settings/SettingsSectionPresets";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  toPublicChatConfig,
  toPublicChatRuntimeMeta,
} from "@/lib/server/public-chat-config";
import { buildFinalSystemPrompt } from "@/lib/server/settings/system-prompt-settings";

const presetKeys = ["default", "fast", "highRecall", "precision"] as const;
const secret = "PRIVATE_SENTINEL";
const userPrompt = "Use a numbered list for my answers.";

function createAdminConfig(): AdminChatConfig {
  const preset: AdminPresetConfig = {
    llmModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    rag: { enabled: true, topK: 6, similarity: 0.4 },
    context: {
      enabled: true,
      tokenBudget: 2048,
      historyBudget: 1024,
      clipTokens: 128,
    },
    features: { reverseRAG: false, hyde: false, ranker: "none" },
    summaryLevel: "low",
    safeMode: true,
    showTelemetry: false,
    showCitations: true,
    additionalSystemPrompt: `${secret}_PRESET`,
    requireLocal: true,
    reasoningEffort: "high",
  };
  const config: AdminChatConfig & { unknownRoot: string } = {
    baseSystemPrompt: `${secret}_BASE`,
    baseSystemPromptSummary: "Answers draw on Jack's work and experience.",
    hydeMode: "auto",
    rewriteMode: "auto",
    ragMultiQueryMode: "auto",
    ragMultiQueryMaxQueries: 4,
    numericLimits: {
      ragTopK: { min: 1, max: 20, default: 6 },
      similarityThreshold: { min: 0, max: 1, default: 0.4 },
      contextBudget: { min: 512, max: 4096, default: 2048 },
      historyBudget: { min: 256, max: 2048, default: 1024 },
      clipTokens: { min: 32, max: 512, default: 128 },
    },
    allowlist: {
      llmModels: ["gpt-4o-mini", "gpt-6-luna"],
      embeddingModels: ["text-embedding-3-small"],
      rankers: ["none", "mmr"],
      allowReverseRAG: true,
      allowHyde: false,
    },
    guardrails: {
      chitchatKeywords: [`${secret}_KEYWORDS`],
      fallbackChitchat: `${secret}_CHITCHAT`,
      fallbackCommand: `${secret}_COMMAND`,
    },
    summaryPresets: {
      low: { every_n_turns: 2 },
      medium: { every_n_turns: 4 },
      high: { every_n_turns: 6 },
    },
    presets: {
      default: structuredClone(preset),
      fast: { ...structuredClone(preset), summaryLevel: "off" },
      highRecall: {
        ...structuredClone(preset),
        rag: { enabled: true, topK: 12, similarity: 0.3 },
        summaryLevel: "high",
      },
      precision: {
        ...structuredClone(preset),
        llmModel: "gpt-6-luna",
        rag: { enabled: true, topK: 3, similarity: 0.6 },
        summaryLevel: "medium",
      },
    },
    ragRanking: { docTypeWeights: {}, personaTypeWeights: {} },
    telemetry: { sampleRate: 0.5, detailLevel: "verbose" },
    cache: { responseTtlSeconds: 300, retrievalTtlSeconds: 60 },
    generation: { reasoningEffort: "high" },
    unknownRoot: secret,
  };
  for (const value of [
    config.numericLimits,
    ...Object.values(config.numericLimits),
    config.allowlist,
    config.summaryPresets,
    ...Object.values(config.summaryPresets),
    ...Object.values(config.presets).flatMap((value) => [
      value,
      value.rag,
      value.context,
      value.features,
    ]),
  ]) {
    Object.assign(value, { unknownNested: secret });
  }
  config.presets.extra = structuredClone(config.presets.fast);
  return config;
}

function createRuntimeMeta(): AdminChatRuntimeMeta {
  const resolution = {
    requestedModelId: "gpt-4o-mini",
    resolvedModelId: "gpt-4o-mini",
    wasSubstituted: false,
    reason: "NONE" as const,
    unknownResolution: secret,
  };
  const meta: AdminChatRuntimeMeta & { unknownRoot: string } = {
    defaultLlmModelId: "gpt-4o-mini",
    defaultLlmModelExplicit: true,
    ollamaConfigured: false,
    lmstudioConfigured: false,
    localLlmBackendEnv: "ollama",
    presetResolutions: {
      default: resolution,
      fast: resolution,
      highRecall: resolution,
      precision: {
        ...resolution,
        requestedModelId: "gpt-6-luna",
        resolvedModelId: "gpt-6-luna",
      },
      extra: resolution,
    },
    unknownRoot: secret,
  };
  return meta;
}

function assertKeys(value: object, keys: readonly string[]) {
  assert.deepEqual(Object.keys(value).toSorted(), keys.toSorted());
}

void test("public config serializes only the explicit public contract at every level", () => {
  const config = toPublicChatConfig(createAdminConfig());
  assertKeys(config, [
    "baseSystemPromptSummary",
    "numericLimits",
    "allowlist",
    "summaryPresets",
    "presets",
  ]);
  assert.equal(
    config.baseSystemPromptSummary,
    "Answers draw on Jack's work and experience.",
  );
  assertKeys(config.numericLimits, [
    "ragTopK",
    "similarityThreshold",
    "contextBudget",
    "historyBudget",
    "clipTokens",
  ]);
  for (const limit of Object.values(config.numericLimits)) {
    assertKeys(limit, ["min", "max", "default"]);
  }
  assert.deepEqual(config.numericLimits.ragTopK, {
    min: 1,
    max: 20,
    default: 6,
  });
  assertKeys(config.allowlist, [
    "llmModels",
    "embeddingModels",
    "rankers",
    "allowReverseRAG",
    "allowHyde",
  ]);
  assert.deepEqual(config.allowlist.llmModels, ["gpt-4o-mini", "gpt-6-luna"]);
  assertKeys(config.summaryPresets, ["low", "medium", "high"]);
  for (const summary of Object.values(config.summaryPresets)) {
    assertKeys(summary, ["every_n_turns"]);
  }
  assertKeys(config.presets, [...presetKeys, "extra"]);
  for (const key of [...presetKeys, "extra"]) {
    const preset = config.presets[key];
    assertKeys(preset, [
      "llmModel",
      "embeddingModel",
      "rag",
      "context",
      "features",
      "summaryLevel",
      "safeMode",
      "showTelemetry",
      "showCitations",
    ]);
    assertKeys(preset.rag, ["enabled", "topK", "similarity"]);
    assertKeys(preset.context, [
      "enabled",
      "tokenBudget",
      "historyBudget",
      "clipTokens",
    ]);
    assertKeys(preset.features, ["reverseRAG", "hyde", "ranker"]);
  }
  assert.deepEqual(config.presets.highRecall.rag, {
    enabled: true,
    topK: 12,
    similarity: 0.3,
  });
  assert.equal(JSON.stringify(config).includes(secret), false);
});

void test("public runtime metadata preserves model resolution and excludes backend policy", () => {
  const meta = toPublicChatRuntimeMeta(createRuntimeMeta());
  assertKeys(meta, [
    "defaultLlmModelId",
    "defaultLlmModelExplicit",
    "ollamaConfigured",
    "lmstudioConfigured",
    "presetResolutions",
  ]);
  assertKeys(meta.presetResolutions, [...presetKeys, "extra"]);
  for (const key of [...presetKeys, "extra"]) {
    assertKeys(meta.presetResolutions[key], [
      "requestedModelId",
      "resolvedModelId",
      "wasSubstituted",
      "reason",
    ]);
  }
  assert.deepEqual(meta.presetResolutions.precision, {
    requestedModelId: "gpt-6-luna",
    resolvedModelId: "gpt-6-luna",
    wasSubstituted: false,
    reason: "NONE",
  });
  assert.equal(JSON.stringify(meta).includes(secret), false);
});

void test("chat page props never serialize private configuration or unknown fields", async () => {
  const config = createAdminConfig();
  const meta = createRuntimeMeta();
  const modules: Record<string, string> = {
    "next/head": "export default function Head() { return null; }",
    "@/components/AiPageChrome":
      "export function AiPageChrome() { return null; }",
    "@/components/chat/ChatFullPage":
      "export function ChatFullPage() { return null; }",
    "@/lib/core/llm-registry":
      'export const DEFAULT_LLM_MODEL_ID = "gpt-4o-mini"; export const IS_DEFAULT_MODEL_EXPLICIT = true;',
    "@/lib/core/lmstudio": "export const isLmStudioConfigured = () => false;",
    "@/lib/core/ollama": "export const isOllamaConfigured = () => false;",
    "@/lib/local-llm": 'export const getLocalLlmBackend = () => "ollama";',
    "@/lib/server/admin-chat-config": `export const getAdminChatConfig = async () => (${JSON.stringify(config)});`,
    "@/lib/server/model-resolution": `export const buildPresetModelResolutions = () => (${JSON.stringify(meta.presetResolutions)});`,
    "@/lib/server/notion-header":
      "export const loadNotionNavigationHeader = async () => ({ headerRecordMap: null, headerBlockId: null });",
  };
  const bundle = await build({
    entryPoints: ["pages/chat.tsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    plugins: [
      {
        name: "page-external-fixtures",
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /.*/ }, (args) =>
            modules[args.path]
              ? { path: args.path, namespace: "fixture" }
              : undefined,
          );
          pluginBuild.onLoad(
            { filter: /.*/, namespace: "fixture" },
            (args) => ({
              contents: modules[args.path],
              loader: "js",
            }),
          );
        },
      },
    ],
  });
  const page = (await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  )) as {
    getServerSideProps: () => Promise<{
      props: { adminConfig: unknown; runtimeMeta: unknown };
    }>;
  };
  const result = await page.getServerSideProps();
  assert.equal(JSON.stringify(result.props).includes(secret), false);
  assert.equal(
    JSON.stringify(result.props).includes("localLlmBackendEnv"),
    false,
  );
});

void test("initial session, selecting each preset, and resetting never seed a private prompt", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://example.test/chat",
  });
  const testWindow = dom.window as unknown as Window;
  const previousNodeEnv = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    requestAnimationFrame: { configurable: true, value: () => 1 },
    cancelAnimationFrame: { configurable: true, value: () => undefined },
  });
  const privateConfig = createAdminConfig();
  const adminConfig = toPublicChatConfig(privateConfig);
  const runtimeMeta = toPublicChatRuntimeMeta(createRuntimeMeta());
  let current: ReturnType<typeof useChatConfig> | undefined;
  function Harness() {
    current = useChatConfig();
    return createElement(
      TooltipProvider,
      null,
      createElement(PresetSelectorTabs, {
        adminConfig: current.adminConfig,
        sessionConfig: current.sessionConfig,
        setSessionConfig: current.setSessionConfig,
      }),
      createElement(ChatAdvancedSettingsDrawer, {
        open: true,
        onClose: () => undefined,
        messages: [],
      }),
    );
  }
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        createElement(ChatConfigProvider, {
          adminConfig,
          runtimeMeta,
          children: createElement(Harness),
        }),
      ),
    );
    assert.ok(current);
    assert.equal(current.sessionConfig.additionalSystemPrompt, "");
    for (const key of presetKeys) {
      const radio = container.querySelector<HTMLInputElement>(
        `input[value="${key}"]`,
      );
      assert.ok(radio);
      act(() => radio.click());
      assert.equal(current.sessionConfig.appliedPreset, key);
      assert.equal(current.sessionConfig.additionalSystemPrompt, "");
      assert.equal(
        current.sessionConfig.rag.topK,
        key === "highRecall" ? 12 : key === "precision" ? 3 : 6,
      );
      const update = createSessionOverrideUpdater(current.setSessionConfig);
      act(() =>
        update((prev) => ({ ...prev, additionalSystemPrompt: userPrompt })),
      );
      assert.equal(current.sessionConfig.additionalSystemPrompt, userPrompt);
      assert.equal(current.sessionConfig.appliedPreset, undefined);
      assert.equal("requireLocal" in current.sessionConfig, false);
      assert.equal(
        computeOverridesActive({
          adminConfig,
          sessionConfig: current.sessionConfig,
        }),
        true,
      );
      act(() =>
        update((prev) => ({
          ...prev,
          summaryLevel: "medium",
          rag: { ...prev.rag, topK: 100 },
        })),
      );
      assert.equal(current.sessionConfig.additionalSystemPrompt, userPrompt);
      assert.equal(current.sessionConfig.rag.topK, 20);
      const stored = JSON.parse(
        testWindow.sessionStorage.getItem("chat-session-config") ?? "{}",
      ) as SessionChatConfig;
      assert.equal(stored.additionalSystemPrompt, userPrompt);
      assert.equal("requireLocal" in stored, false);
      act(() =>
        root.render(
          createElement(ChatConfigProvider, {
            adminConfig,
            runtimeMeta,
            children: createElement(Harness),
            key: `restore-${key}`,
          }),
        ),
      );
      assert.equal(current.sessionConfig.additionalSystemPrompt, userPrompt);
      assert.equal(
        buildFinalSystemPrompt({
          adminConfig: privateConfig,
          sessionConfig: current.sessionConfig,
        }),
        `${secret}_BASE\n\n${secret}_PRESET\n\n${userPrompt}`,
      );
      const reset = Array.from(
        testWindow.document.querySelectorAll("button"),
      ).find((button) => button.textContent === "Reset to Preset Defaults");
      assert.ok(reset);
      act(() => reset.click());
      assert.equal(current.sessionConfig.appliedPreset, "default");
      assert.equal(current.sessionConfig.additionalSystemPrompt, "");
      assert.equal(
        computeOverridesActive({
          adminConfig,
          sessionConfig: current.sessionConfig,
        }),
        false,
      );
    }
  } finally {
    act(() => root.unmount());
    dom.window.close();
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }
  }
});
