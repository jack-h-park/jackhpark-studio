import type { LogLevel } from "@/lib/logging/types";

type LoggingDomain = "rag" | "ingestion" | "notion" | "externalLLM";

const LOG_LEVEL_PRIORITY: LogLevel[] = [
  "off",
  "error",
  "info",
  "debug",
  "trace",
];
const DOMAIN_OVERRIDE_KEYS: Record<LoggingDomain, string> = {
  rag: "LOG_RAG_LEVEL",
  ingestion: "LOG_INGESTION_LEVEL",
  notion: "LOG_NOTION_LEVEL",
  externalLLM: "LOG_LLM_LEVEL",
};

function parseLogLevel(value: string | undefined | null): LogLevel | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (LOG_LEVEL_PRIORITY.includes(normalized as LogLevel)) {
    return normalized as LogLevel;
  }
  return null;
}

function resolveGlobalLevel(): LogLevel {
  const fallback =
    process.env.NODE_ENV === "production"
      ? ("info" as LogLevel)
      : ("debug" as LogLevel);
  return parseLogLevel(process.env.LOG_GLOBAL_LEVEL) ?? fallback;
}

function getDomainLevel(domain: LoggingDomain): LogLevel {
  const override = parseLogLevel(
    process.env[DOMAIN_OVERRIDE_KEYS[domain] as keyof NodeJS.ProcessEnv],
  );
  return override ?? resolveGlobalLevel();
}

function compareLevels(current: LogLevel, target: LogLevel): boolean {
  if (current === "off") {
    return false;
  }
  return (
    LOG_LEVEL_PRIORITY.indexOf(current) >= LOG_LEVEL_PRIORITY.indexOf(target)
  );
}

export function getClientLogLevel(domain: LoggingDomain): LogLevel {
  return getDomainLevel(domain);
}

export function isClientLogLevelEnabled(
  domain: LoggingDomain,
  targetLevel: LogLevel,
): boolean {
  return compareLevels(getDomainLevel(domain), targetLevel);
}
