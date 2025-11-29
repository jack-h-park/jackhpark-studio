import type { NextApiRequest, NextApiResponse } from "next";

import type { ChatEngine, ModelProvider } from "@/lib/shared/model-provider";
import { SYSTEM_PROMPT_MAX_LENGTH } from "@/lib/chat-prompts";
import {
  getChatModelDefaults,
  getGuardrailDefaults,
  getLangfuseDefaults,
  type GuardrailNumericSettings,
  loadChatModelSettings,
  loadGuardrailSettings,
  loadLangfuseSettings,
  loadSystemPrompt,
  saveChatModelSettings,
  saveGuardrailSettings,
  saveLangfuseSettings,
  saveSystemPrompt,
} from "@/lib/server/chat-settings";
import {
  DEFAULT_HYDE_ENABLED,
  DEFAULT_RANKER_MODE,
  DEFAULT_REVERSE_RAG_ENABLED,
  DEFAULT_REVERSE_RAG_MODE,
  parseBooleanFlag,
  parseRankerMode,
  parseReverseRagMode,
} from "@/lib/shared/rag-config";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    try {
      const [
        promptResult,
        guardrailResult,
        chatModelSettings,
        langfuseSettings,
      ] = await Promise.all([
        loadSystemPrompt({ forceRefresh: true }),
        loadGuardrailSettings({ forceRefresh: true }),
        loadChatModelSettings({ forceRefresh: true }),
        loadLangfuseSettings({ forceRefresh: true }),
      ]);
      return res.status(200).json({
        systemPrompt: promptResult.prompt,
        isDefault: promptResult.isDefault,
        guardrails: guardrailResult,
        models: chatModelSettings,
        langfuse: langfuseSettings,
        guardrailDefaults: getGuardrailDefaults(),
        modelDefaults: getChatModelDefaults(),
        langfuseDefaults: getLangfuseDefaults(),
        tracingConfigured:
          Boolean(process.env.LANGFUSE_PUBLIC_KEY?.trim()) &&
          Boolean(process.env.LANGFUSE_SECRET_KEY?.trim()) &&
          Boolean(process.env.LANGFUSE_BASE_URL?.trim()),
      });
    } catch (err: any) {
      console.error("[api/admin/chat-settings] failed to load settings", err);
      return res.status(500).json({
        error: err?.message ?? "Failed to load chat settings",
      });
    }
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    try {
      const payload =
        typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
      const { systemPrompt, guardrails, models, langfuse } = payload as {
        systemPrompt?: unknown;
        guardrails?: {
          chitchatKeywords?: unknown;
          fallbackChitchat?: unknown;
          fallbackCommand?: unknown;
          numeric?: Partial<Record<keyof GuardrailNumericSettings, unknown>>;
        };
        models?: {
          engine?: unknown;
          llmModel?: unknown;
          embeddingModel?: unknown;
          embeddingSpaceId?: unknown;
          llmProvider?: unknown;
          embeddingProvider?: unknown;
          reverseRagEnabled?: unknown;
          reverseRagMode?: unknown;
          hydeEnabled?: unknown;
          rankerMode?: unknown;
        };
        langfuse?: {
          envTag?: unknown;
          sampleRateDev?: unknown;
          sampleRatePreview?: unknown;
          attachProviderMetadata?: unknown;
        };
      };

      const hasPrompt = typeof systemPrompt === "string";
      const numericPayload = guardrails?.numeric;
      const hasGuardrails =
        guardrails &&
        typeof guardrails === "object" &&
        guardrails !== null &&
        typeof guardrails.chitchatKeywords === "string" &&
        typeof guardrails.fallbackChitchat === "string" &&
        typeof guardrails.fallbackCommand === "string" &&
        isValidNumericPayload(numericPayload);

      const hasModels =
        models &&
        typeof models === "object" &&
        models !== null &&
        typeof models.engine === "string" &&
        (typeof models.llmModel === "string" ||
          models.llmModel === undefined ||
          models.llmModel === null) &&
        (typeof models.embeddingModel === "string" ||
          models.embeddingModel === undefined ||
          models.embeddingModel === null) &&
        (typeof models.embeddingSpaceId === "string" ||
          models.embeddingSpaceId === undefined ||
          models.embeddingSpaceId === null) &&
        (typeof models.llmProvider === "string" ||
          models.llmProvider === undefined ||
          models.llmProvider === null) &&
        (typeof models.embeddingProvider === "string" ||
          models.embeddingProvider === undefined ||
          models.embeddingProvider === null);

      const hasLangfuse =
        langfuse &&
        typeof langfuse === "object" &&
        langfuse !== null &&
        typeof langfuse.envTag === "string" &&
        typeof langfuse.sampleRateDev === "number" &&
        typeof langfuse.sampleRatePreview === "number" &&
        typeof langfuse.attachProviderMetadata === "boolean";

      if (!hasPrompt && !hasGuardrails && !hasModels && !hasLangfuse) {
        return res.status(400).json({
          error:
            "Provide systemPrompt, guardrails, models, or langfuse payload.",
        });
      }

      let promptResult:
        | Awaited<ReturnType<typeof saveSystemPrompt>>
        | undefined;
      let guardrailResult:
        | Awaited<ReturnType<typeof saveGuardrailSettings>>
        | undefined;
      let chatModelResult:
        | Awaited<ReturnType<typeof saveChatModelSettings>>
        | undefined;
      let langfuseResult:
        | Awaited<ReturnType<typeof saveLangfuseSettings>>
        | undefined;

      if (hasPrompt) {
        const promptValue = systemPrompt as string;

        if (promptValue.length > SYSTEM_PROMPT_MAX_LENGTH) {
          return res.status(400).json({
            error: `systemPrompt must be at most ${SYSTEM_PROMPT_MAX_LENGTH} characters`,
          });
        }

        promptResult = await saveSystemPrompt(promptValue);
      }

      if (hasGuardrails) {
        guardrailResult = await saveGuardrailSettings({
          chitchatKeywords: guardrails!.chitchatKeywords as string,
          fallbackChitchat: guardrails!.fallbackChitchat as string,
          fallbackCommand: guardrails!.fallbackCommand as string,
          numeric: numericPayload as GuardrailNumericSettings,
        });
      }

      if (hasModels) {
        const reverseRagEnabledValue = parseBooleanFlag(
          models!.reverseRagEnabled,
          DEFAULT_REVERSE_RAG_ENABLED,
        );
        const reverseRagModeValue = parseReverseRagMode(
          models!.reverseRagMode,
          DEFAULT_REVERSE_RAG_MODE,
        );
        const hydeEnabledValue = parseBooleanFlag(
          models!.hydeEnabled,
          DEFAULT_HYDE_ENABLED,
        );
        const rankerModeValue = parseRankerMode(
          models!.rankerMode,
          DEFAULT_RANKER_MODE,
        );

        chatModelResult = await saveChatModelSettings({
          engine: models!.engine as ChatEngine,
          llmProvider: models!.llmProvider as ModelProvider | undefined,
          embeddingProvider: models!.embeddingProvider as
            | ModelProvider
            | undefined,
          llmModel: models!.llmModel as string | undefined,
          embeddingModel: models!.embeddingModel as string | undefined,
          embeddingSpaceId: models!.embeddingSpaceId as string | undefined,
          reverseRagEnabled: reverseRagEnabledValue,
          reverseRagMode: reverseRagModeValue,
          hydeEnabled: hydeEnabledValue,
          rankerMode: rankerModeValue,
        });
      }

      if (hasLangfuse) {
        langfuseResult = await saveLangfuseSettings({
          envTag: (langfuse!.envTag as string).trim(),
          sampleRateDev: langfuse!.sampleRateDev as number,
          sampleRatePreview: langfuse!.sampleRatePreview as number,
          attachProviderMetadata: langfuse!.attachProviderMetadata as boolean,
        });
      }

      return res.status(200).json({
        ...(promptResult
          ? {
              systemPrompt: promptResult.prompt,
              isDefault: promptResult.isDefault,
            }
          : {}),
        ...(guardrailResult ? { guardrails: guardrailResult } : {}),
        ...(chatModelResult ? { models: chatModelResult } : {}),
        ...(langfuseResult ? { langfuse: langfuseResult } : {}),
      });
    } catch (err: any) {
      console.error("[api/admin/chat-settings] failed to update settings", err);
      return res.status(500).json({
        error: err?.message ?? "Failed to update chat settings",
      });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "PATCH"]);
  return res.status(405).json({ error: "Method Not Allowed" });
}

const GUARDRAIL_NUMERIC_KEYS: Array<keyof GuardrailNumericSettings> = [
  "similarityThreshold",
  "ragTopK",
  "ragContextTokenBudget",
  "ragContextClipTokens",
  "historyTokenBudget",
  "summaryEnabled",
  "summaryTriggerTokens",
  "summaryMaxTurns",
  "summaryMaxChars",
];

function isValidNumericPayload(
  candidate:
    | Partial<Record<keyof GuardrailNumericSettings, unknown>>
    | undefined,
): candidate is GuardrailNumericSettings {
  if (!candidate) {
    return false;
  }

  return GUARDRAIL_NUMERIC_KEYS.every((key) => {
    const value = candidate[key];
    if (key === "summaryEnabled") {
      return typeof value === "boolean";
    }
    return typeof value === "number" && Number.isFinite(value);
  });
}
