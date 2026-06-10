import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import {
  DEFAULT_SYSTEM_PROMPT,
  normalizeSystemPrompt,
  SYSTEM_PROMPT_CACHE_TTL_MS,
} from "@/lib/chat-prompts";
import { loadAdminChatConfig } from "@/lib/server/admin-chat-config";

import { resolvePresetKey } from "./preset-resolution";
import { TtlCache } from "./ttl-cache";

const ADDITIONAL_PROMPT_MAX_LENGTH = 2000;

const DEFAULT_PROMPT_FALLBACK = normalizeSystemPrompt(DEFAULT_SYSTEM_PROMPT);

export type SystemPromptResult = {
  prompt: string;
  isDefault: boolean;
};

const promptCache = new TtlCache<SystemPromptResult>(
  SYSTEM_PROMPT_CACHE_TTL_MS,
);

const normalizeAdditionalPrompt = (
  value: unknown,
  maxLength: number,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.replaceAll("\r\n", "\n").trim().slice(0, maxLength);
};

function resolvePromptParts({
  adminConfig,
  sessionConfig,
}: {
  adminConfig: AdminChatConfig;
  sessionConfig?: SessionChatConfig;
}) {
  const presetKey = resolvePresetKey(adminConfig, sessionConfig);

  const basePrompt =
    adminConfig.baseSystemPrompt &&
    adminConfig.baseSystemPrompt.trim().length > 0
      ? normalizeSystemPrompt(adminConfig.baseSystemPrompt)
      : DEFAULT_PROMPT_FALLBACK;

  const presetAdditional = normalizeAdditionalPrompt(
    adminConfig.presets?.[presetKey]?.additionalSystemPrompt,
    ADDITIONAL_PROMPT_MAX_LENGTH,
  );
  const sessionAdditional = normalizeAdditionalPrompt(
    sessionConfig?.additionalSystemPrompt,
    ADDITIONAL_PROMPT_MAX_LENGTH,
  );

  return { basePrompt, presetAdditional, sessionAdditional };
}

export function buildFinalSystemPrompt({
  adminConfig,
  sessionConfig,
}: {
  adminConfig: AdminChatConfig;
  sessionConfig?: SessionChatConfig;
}): string {
  const { basePrompt, presetAdditional, sessionAdditional } =
    resolvePromptParts({ adminConfig, sessionConfig });

  return [basePrompt, presetAdditional, sessionAdditional]
    .filter((part) => Boolean(part && String(part).length > 0))
    .join("\n\n");
}

export async function loadSystemPrompt(options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
  sessionConfig?: SessionChatConfig;
}): Promise<SystemPromptResult> {
  const cached =
    !options?.forceRefresh && !options?.sessionConfig
      ? promptCache.get()
      : null;
  if (cached) {
    return cached;
  }

  const config = await loadAdminChatConfig({
    client: options?.client,
    forceRefresh: options?.forceRefresh,
  });

  const { basePrompt, presetAdditional, sessionAdditional } =
    resolvePromptParts({
      adminConfig: config,
      sessionConfig: options?.sessionConfig,
    });
  const prompt = buildFinalSystemPrompt({
    adminConfig: config,
    sessionConfig: options?.sessionConfig,
  });
  const isDefault =
    basePrompt === DEFAULT_PROMPT_FALLBACK &&
    !presetAdditional &&
    !sessionAdditional;

  const result: SystemPromptResult = { prompt, isDefault };
  if (!options?.sessionConfig) {
    promptCache.set(result);
  }
  return result;
}
