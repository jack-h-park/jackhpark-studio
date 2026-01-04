import type { LoggingConfig, LogLevel } from "@/lib/logging/types";
import {
  buildDomainLoggingState,
  buildLoggingConfig,
} from "@/lib/logging/config";

export type LoggingDomain =
  | "rag"
  | "ingestion"
  | "notion"
  | "externalLLM"
  | "db"
  | "telemetryLog";

const LOG_LEVEL_PRIORITY: LogLevel[] = [
  "off",
  "error",
  "info",
  "debug",
  "trace",
];

let fallbackDomainState: ReturnType<typeof buildDomainLoggingState> | null =
  null;
let cachedConfig: LoggingConfig | null = null;
let configPromise: Promise<LoggingConfig> | null = null;

// Helper to get the best-available domain state synchronously
function getDomainStateSync(): ReturnType<typeof buildDomainLoggingState> {
  // 1. Prefer the full resolved config if available
  if (cachedConfig) {
    return cachedConfig;
  }
  // 2. Otherwise use the lazy fallback (computed once)
  if (!fallbackDomainState) {
    fallbackDomainState = buildDomainLoggingState();
  }
  return fallbackDomainState;
}

async function ensureLoggingConfig(): Promise<LoggingConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (!configPromise) {
    configPromise = buildLoggingConfig().then((config) => {
      cachedConfig = config;
      if (
        process.env.NODE_ENV !== "production" &&
        (config.telemetry.sampleRate < 0 || config.telemetry.sampleRate > 1)
      ) {
        console.warn(
          `[logging-config] telemetry.sampleRate=${config.telemetry.sampleRate} is out of bounds (allowed 0-1).` +
            " buildLoggingConfig clamps the value, so this warning should only trigger if something upstream mutated the config.",
        );
      }
      return config;
    });
  }

  return configPromise;
}

function getDomainLevel(domain: LoggingDomain): LogLevel {
  const state = getDomainStateSync();
  return state[domain]?.level ?? state.globalLevel;
}

function shouldLog(currentLevel: LogLevel, target: LogLevel): boolean {
  if (currentLevel === "off") {
    return false;
  }

  const currentIndex = LOG_LEVEL_PRIORITY.indexOf(currentLevel);
  const targetIndex = LOG_LEVEL_PRIORITY.indexOf(target);
  return currentIndex >= targetIndex;
}

function writeLog(
  domain: LoggingDomain,
  targetLevel: LogLevel,
  consoleMethod: (...args: unknown[]) => void,
  message: string,
  payload?: unknown,
) {
  const level = getDomainLevel(domain);
  if (!shouldLog(level, targetLevel)) {
    return;
  }

  const label = `[${domain}] ${message}`;
  if (payload === undefined) {
    consoleMethod(label);
    return;
  }

  consoleMethod(label, payload);
}

function createDomainLogger(domain: LoggingDomain) {
  return {
    error: (message: string, payload?: unknown) =>
      writeLog(domain, "error", console.error, message, payload),
    info: (message: string, payload?: unknown) =>
      writeLog(domain, "info", console.info, message, payload),
    debug: (message: string, payload?: unknown) =>
      writeLog(domain, "debug", console.debug, message, payload),
    trace: (message: string, payload?: unknown) =>
      writeLog(domain, "trace", console.trace, message, payload),
  };
}

export async function getLoggingConfig(): Promise<LoggingConfig> {
  return ensureLoggingConfig();
}

export function isDomainLogLevelEnabled(
  domain: LoggingDomain,
  targetLevel: LogLevel,
): boolean {
  return shouldLog(getDomainLevel(domain), targetLevel);
}

export const ragLogger = createDomainLogger("rag");
export const ingestionLogger = createDomainLogger("ingestion");
export const notionLogger = createDomainLogger("notion");
export const llmLogger = createDomainLogger("externalLLM");
export const dbLogger = createDomainLogger("db");
export const telemetryLogger = createDomainLogger("telemetryLog");
