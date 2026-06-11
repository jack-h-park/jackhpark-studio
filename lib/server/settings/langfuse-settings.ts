import type { SupabaseClient } from "@supabase/supabase-js";

import { TtlCache } from "./ttl-cache";

const LANGFUSE_SETTINGS_CACHE_TTL_MS = 60_000;

export type LangfuseSettings = {
  envTag: string;
  attachProviderMetadata: boolean;
  isDefault: {
    envTag: boolean;
    attachProviderMetadata: boolean;
  };
};

const DEFAULT_LANGFUSE_ENV_TAG =
  process.env.LANGFUSE_ENV_TAG ??
  process.env.APP_ENV ??
  process.env.NODE_ENV ??
  "dev";
const DEFAULT_LANGFUSE_ATTACH_PROVIDER_METADATA =
  (process.env.LANGFUSE_ATTACH_PROVIDER_METADATA ?? "true").toLowerCase() !==
  "false";

const langfuseCache = new TtlCache<LangfuseSettings>(
  LANGFUSE_SETTINGS_CACHE_TTL_MS,
);

export function getLangfuseDefaults(): LangfuseSettings {
  return {
    envTag: DEFAULT_LANGFUSE_ENV_TAG,
    attachProviderMetadata: DEFAULT_LANGFUSE_ATTACH_PROVIDER_METADATA,
    isDefault: {
      envTag: true,
      attachProviderMetadata: true,
    },
  };
}

export async function loadLangfuseSettings(_options?: {
  forceRefresh?: boolean;
  client?: SupabaseClient;
}): Promise<LangfuseSettings> {
  const cached = !_options?.forceRefresh ? langfuseCache.get() : null;
  if (cached) {
    return cached;
  }

  return langfuseCache.set(getLangfuseDefaults());
}
