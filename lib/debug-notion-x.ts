import type { LogLevel } from "@/lib/logging/types";
import { isClientLogLevelEnabled } from "@/lib/logging/client";

export const debugNotionXEnabled = isClientLogLevelEnabled("notion", "debug");

type ConsoleMethod = (...args: unknown[]) => void;

const wrap =
  (targetLevel: LogLevel, method: ConsoleMethod): ConsoleMethod =>
  (...args) => {
    if (!isClientLogLevelEnabled("notion", targetLevel)) return;
    method.apply(console, args);
  };

export const debugNotionXLogger = {
  log: wrap("info", console.log),
  info: wrap("info", console.info),
  debug: wrap("debug", console.debug),
  trace: wrap("trace", console.trace),
};
