const DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";

const rawBaseUrl = process.env.LMSTUDIO_BASE_URL?.trim() ?? "";
const nodeEnv = process.env.NODE_ENV ?? "development";
const enableInProd =
  (process.env.LMSTUDIO_ENABLE_IN_PROD ?? "false").toLowerCase() === "true";
const resolvedBaseUrl =
  rawBaseUrl.length > 0
    ? rawBaseUrl
    : nodeEnv === "production"
      ? ""
      : DEFAULT_BASE_URL;
const timeoutMs = Number(process.env.LMSTUDIO_TIMEOUT_MS ?? 0);
const isProd = nodeEnv === "production";
const enabled =
  Boolean(resolvedBaseUrl) && (!isProd || enableInProd);

export type LmStudioRuntimeConfig = {
  baseUrl: string | null;
  timeoutMs: number | null;
  enabled: boolean;
};

const runtimeConfig: LmStudioRuntimeConfig = {
  baseUrl: resolvedBaseUrl || null,
  timeoutMs: timeoutMs > 0 ? timeoutMs : null,
  enabled,
};

export function getLmStudioRuntimeConfig(): LmStudioRuntimeConfig {
  return runtimeConfig;
}

export function isLmStudioEnabled(): boolean {
  return runtimeConfig.enabled;
}
