import type {
  DomainLoggingConfig,
  LoggingConfig,
  LogLevel,
  TelemetryConfig,
  TelemetryDetailLevel,
} from "@/lib/logging/types";
import { getAppEnv } from "@/lib/langfuse";
import { getAdminChatConfig } from "@/lib/server/admin-chat-config";

const TELEMETRY_DETAIL_ORDER: TelemetryDetailLevel[] = [
  "minimal",
  "standard",
  "verbose",
];

const LOG_LEVEL_SET = new Set<LogLevel>([
  "off",
  "error",
  "info",
  "debug",
  "trace",
]);

function parseLogLevel(value: string | undefined): LogLevel | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (LOG_LEVEL_SET.has(normalized as LogLevel)) {
    return normalized as LogLevel;
  }
  return null;
}

function parseLogLevelWithFallback(
  value: string | undefined,
  fallback: LogLevel,
): LogLevel {
  return parseLogLevel(value) ?? fallback;
}

const DEPRECATED_LOGGING_ENV_KEYS = [
  "FORCE_RAG_VERBOSE_RETRIEVAL_LOGS",
  "DEBUG_RAG_URLS",
  "DEBUG_RAG_STEPS",
  "DEBUG_RAG_MSGS",
  "DEBUG_LANGFUSE",
  "DEBUG_NOTION_X",
  "DEBUG_OLLAMA_TIMING",
  "DEBUG_LANGCHAIN_STREAM",
  "NEXT_PUBLIC_DEBUG_LANGCHAIN_STREAM",
  "DEBUG_INGESTION",
  "DEBUG_NOTION_PAGE_ID",
] as const;

function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value == null) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }
  return fallback;
}

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (value == null) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, parsed));
}

function parseTelemetryDetail(
  value: string | undefined,
): TelemetryDetailLevel | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (TELEMETRY_DETAIL_ORDER.includes(normalized as TelemetryDetailLevel)) {
    return normalized as TelemetryDetailLevel;
  }
  return null;
}

function parseTelemetryDetailWithFallback(
  value: string | undefined,
  fallback: TelemetryDetailLevel,
): TelemetryDetailLevel {
  return parseTelemetryDetail(value) ?? fallback;
}

function clampDetail(
  value: TelemetryDetailLevel,
  max: TelemetryDetailLevel,
): TelemetryDetailLevel {
  const valueIndex = TELEMETRY_DETAIL_ORDER.indexOf(value);
  const maxIndex = TELEMETRY_DETAIL_ORDER.indexOf(max);

  if (valueIndex <= maxIndex) {
    return value;
  }

  return max;
}

function warnDeprecatedLoggingEnv(env: LoggingConfig["env"]) {
  const found = DEPRECATED_LOGGING_ENV_KEYS.filter(
    (key) => process.env[key] != null,
  );

  if (!found.length) {
    return;
  }

  console.warn(
    `[logging-config:${env}] Deprecated logging env vars detected: ${found.join(
      ", ",
    )}. Please remove or migrate them to the unified logging/telemetry config.`,
  );
}

export function resolveLoggingEnv(): LoggingConfig["env"] {
  const appEnv = getAppEnv();

  if (appEnv === "prod") {
    return "production";
  }
  if (appEnv === "preview") {
    return "preview";
  }
  return "local";
}

export function resolveGlobalLogLevel(env: LoggingConfig["env"]): LogLevel {
  const fallback = env === "production" ? "info" : "debug";
  return parseLogLevelWithFallback(process.env.LOG_GLOBAL_LEVEL, fallback);
}

function buildDomainConfig(level: LogLevel): DomainLoggingConfig {
  return { level };
}

// Domain console logging levels are controlled via LOG_GLOBAL_LEVEL and per-domain overrides
// (LOG_RAG_LEVEL, LOG_INGESTION_LEVEL, LOG_NOTION_LEVEL, LOG_LLM_LEVEL, LOG_TELEMETRY_LEVEL, LOG_DB_LEVEL).
export function buildDomainLoggingState(
  env?: LoggingConfig["env"],
): Omit<LoggingConfig, "telemetry"> {
  const resolvedEnv = env ?? resolveLoggingEnv();
  const globalLevel = resolveGlobalLogLevel(resolvedEnv);
  const ragLevel = parseLogLevelWithFallback(
    process.env.LOG_RAG_LEVEL,
    globalLevel,
  );
  const ingestionLevel = parseLogLevelWithFallback(
    process.env.LOG_INGESTION_LEVEL,
    globalLevel,
  );
  const notionLevel = parseLogLevelWithFallback(
    process.env.LOG_NOTION_LEVEL,
    globalLevel,
  );
  const llmLevel = parseLogLevelWithFallback(
    process.env.LOG_LLM_LEVEL,
    globalLevel,
  );
  const telemetryLogLevel = parseLogLevelWithFallback(
    process.env.LOG_TELEMETRY_LEVEL,
    globalLevel,
  );
  const dbLevel = parseLogLevelWithFallback(
    process.env.LOG_DB_LEVEL,
    globalLevel,
  );
  return {
    env: resolvedEnv,
    globalLevel,
    rag: buildDomainConfig(ragLevel),
    ingestion: buildDomainConfig(ingestionLevel),
    notion: buildDomainConfig(notionLevel),
    externalLLM: buildDomainConfig(llmLevel),
    telemetryLog: buildDomainConfig(telemetryLogLevel),
    db: buildDomainConfig(dbLevel),
  };
}

export async function buildLoggingConfig(): Promise<LoggingConfig> {
  const env = resolveLoggingEnv();
  warnDeprecatedLoggingEnv(env);
  const domainState = buildDomainLoggingState(env);

  const telemetryEnabled = parseBooleanEnv(process.env.TELEMETRY_ENABLED, true);

  // Defaults and limits derive from ENV with sensible fallback per environment.
  const sampleDefault = parseSampleRate(
    process.env.TELEMETRY_SAMPLE_RATE_DEFAULT,
    1,
  );
  const sampleMax = parseSampleRate(process.env.TELEMETRY_SAMPLE_RATE_MAX, 1);
  const detailDefault = parseTelemetryDetailWithFallback(
    process.env.TELEMETRY_DETAIL_DEFAULT,
    env === "local" ? "verbose" : "standard",
  );
  const detailMax = parseTelemetryDetailWithFallback(
    process.env.TELEMETRY_DETAIL_MAX,
    env === "production" ? "standard" : "verbose",
  );

  const adminConfig = await getAdminChatConfig();
  const baseSample = adminConfig.telemetry.sampleRate ?? sampleDefault;
  const baseDetail = adminConfig.telemetry.detailLevel ?? detailDefault;

  /**
   * Telemetry merge rules:
   *
   * - Admin DB config is the primary source of truth; TELEMETRY_SAMPLE_RATE_DEFAULT
   *   / TELEMETRY_DETAIL_DEFAULT are only fallbacks, and *_MAX values enforce upper
   *   bounds on the final selection.
   * - TELEMETRY_ENABLED=false short-circuits telemetry (telemetry.enabled=false)
   *   regardless of DB values.
   * - Production:
   *   - Uses DB values → fallbacks → clamps by *_MAX.
   *   - Overrides (TELEMETRY_DETAIL_OVERRIDE / TELEMETRY_SAMPLE_RATE_OVERRIDE)
   *     are ignored to keep production behavior predictable and safe.
   * - Non-production:
   *   - Applies overrides after DB/default merge and before clamping.
   *   - Overrides are only a temporary debugging aid and should not be relied
   *     on for long-term telemetry settings.
   */
  const overrideDetail =
    env === "production"
      ? null
      : parseTelemetryDetail(process.env.TELEMETRY_DETAIL_OVERRIDE);
  const overrideSample =
    env === "production"
      ? Number.NaN
      : parseSampleRate(process.env.TELEMETRY_SAMPLE_RATE_OVERRIDE, Number.NaN);

  const withOverrideDetail = overrideDetail ?? baseDetail;
  const withOverrideSample = Number.isFinite(overrideSample)
    ? overrideSample
    : baseSample;

  const effectiveDetail = clampDetail(withOverrideDetail, detailMax);
  const effectiveSample = Math.min(withOverrideSample, sampleMax);

  // Kill switch short-circuits regardless of DB defaults but retains telemetry
  // metadata for observability in non-production.
  const enabled = telemetryEnabled && effectiveSample > 0;

  const telemetry: TelemetryConfig = {
    enabled,
    sampleRate: effectiveSample,
    detailLevel: effectiveDetail,
  };

  return {
    ...domainState,
    telemetry,
  };
}
