import { createWriteStream, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
let warnedFileLogPathInsideCwd = false;

type LogSink = {
  write: (event: {
    domain: LoggingDomain;
    level: LogLevel;
    message: string;
    payload?: unknown;
  }) => void;
};

function isPathInsideCwd(filePath: string): boolean {
  const cwd = path.resolve(process.cwd());
  const resolved = path.resolve(filePath);
  const relative = path.relative(cwd, resolved);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function resolveFileLogPath(): string | null {
  const explicit = process.env.LOG_FILE_PATH?.trim();
  const shouldLogToFile =
    process.env.LOG_TO_FILE === "1" ||
    process.env.LOG_FILE_ENABLED === "1" ||
    Boolean(explicit);

  if (!shouldLogToFile) {
    return null;
  }

  const defaultPath = path.join(
    tmpdir(),
    "jack-rag-logs",
    path.basename(process.cwd()),
    "server.log",
  );
  const candidate = explicit
    ? path.resolve(process.cwd(), explicit)
    : defaultPath;
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev && isPathInsideCwd(candidate)) {
    if (!warnedFileLogPathInsideCwd) {
      warnedFileLogPathInsideCwd = true;
      console.warn(
        `[logging] LOG_FILE_PATH resolves under project root (${candidate}). In development, file logging falls back to stdout to avoid Fast Refresh reload loops.`,
      );
    }
    return null;
  }

  return candidate;
}

function createLogSink(): LogSink | null {
  const filePath = resolveFileLogPath();
  if (!filePath) {
    return null;
  }

  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const stream = createWriteStream(filePath, { flags: "a" });
    stream.on("error", (err) => {
      console.warn("[logging] file sink write error, using stdout only", err);
    });

    return {
      write: ({ domain, level, message, payload }) => {
        const line = JSON.stringify({
          ts: new Date().toISOString(),
          domain,
          level,
          message,
          ...(payload === undefined ? {} : { payload }),
        });
        stream.write(`${line}\n`);
      },
    };
  } catch (err) {
    console.warn("[logging] file sink disabled; failed to initialize", err);
    return null;
  }
}

const logSink = createLogSink();

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
    logSink?.write({
      domain,
      level: targetLevel,
      message,
    });
    return;
  }

  consoleMethod(label, payload);
  logSink?.write({
    domain,
    level: targetLevel,
    message,
    payload,
  });
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
