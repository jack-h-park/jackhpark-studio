import type { NextApiRequest, NextApiResponse } from "next";

import { llmLogger } from "@/lib/logging/logger";
import { isDebugSurfacesEnabled } from "@/lib/server/debug/debug-surfaces";

const debugSurfacesEnabled = isDebugSurfacesEnabled();

const SMOKE_HEADERS_ENABLED =
  process.env.SMOKE_HEADERS === "1" || process.env.NODE_ENV !== "production";

export function setSmokeHeaders(
  res: NextApiResponse,
  cacheHit: boolean | null,
) {
  if (!SMOKE_HEADERS_ENABLED) {
    return;
  }
  res.setHeader("x-cache-hit", cacheHit === true ? "1" : "0");
}

export class StageTimeoutError extends Error {
  constructor(public stage: string) {
    super(`stage-timeout:${stage}`);
  }
}

/**
 * Per-request HTTP scaffolding for the chat handler: stage marking, the
 * response watchdog, stage timeouts, JSON fallbacks, and early streaming.
 * Keeps timer/response bookkeeping out of the orchestration logic.
 */
export type ChatHttpRuntime = {
  startTime: number;
  getLastStage: () => string;
  mark: (stage: string, extra?: Record<string, unknown>) => void;
  respondJson: (status: number, payload: unknown) => void;
  runStage: <T>(stage: string, action: () => Promise<T>) => Promise<T>;
  scheduleWatchdog: () => void;
  clearWatchdog: () => void;
  /** Watchdog aborts this controller when it fires. */
  setAbortController: (controller: AbortController | null) => void;
  ensureStreamStartedEarly: (marker?: string) => void;
  wasEarlyStreamStarted: () => boolean;
  getHeaderValue: (name: string) => string | undefined;
  getDebugFlag: (key: string) => boolean;
  logReturn: (label: string) => void;
};

export function createChatHttpRuntime(
  req: NextApiRequest,
  res: NextApiResponse,
): ChatHttpRuntime {
  const startTime = Date.now();
  let lastStage = "handler-start";
  let watchdogTimer: NodeJS.Timeout | null = null;
  let abortController: AbortController | null = null;
  let earlyStreamStarted = false;

  const WATCHDOG_TIMEOUT_MS =
    process.env.NODE_ENV === "production" ? 15_000 : 30_000;
  const STAGE_TIMEOUT_MS =
    process.env.NODE_ENV === "production" ? 8000 : 15_000;

  const logReturn = (label: string) => {
    llmLogger.debug(`[langchain_chat] returning from ${label}`, {
      headersSent: res.headersSent,
      ended: res.writableEnded,
    });
  };

  const clearWatchdog = () => {
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  };

  const mark = (stage: string, extra?: Record<string, unknown>) => {
    lastStage = stage;
    llmLogger.debug("[langchain_chat] stage", {
      stage,
      elapsedMs: Date.now() - startTime,
      headersSent: res.headersSent,
      writableEnded: res.writableEnded,
      ...extra,
    });
    if (res.headersSent) {
      clearWatchdog();
    }
  };

  const respondJson = (status: number, payload: unknown) => {
    clearWatchdog();
    if (res.headersSent) {
      res.write(`\n${JSON.stringify(payload)}`);
      res.end();
      return;
    }
    res.status(status).json(payload);
  };

  const runStage = async <T>(
    stage: string,
    action: () => Promise<T>,
  ): Promise<T> => {
    mark(`${stage}-start`);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new StageTimeoutError(stage)),
        STAGE_TIMEOUT_MS,
      );
    });
    try {
      const result = await Promise.race([action(), timeoutPromise]);
      mark(`${stage}-done`);
      return result;
    } catch (err) {
      if (err instanceof StageTimeoutError) {
        mark("timeout", { stage: err.stage });
        if (!res.headersSent && !res.writableEnded) {
          respondJson(504, {
            error: "stage timeout",
            stage: err.stage,
            timeoutMs: STAGE_TIMEOUT_MS,
          });
        }
      }
      throw err;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  const triggerWatchdog = () => {
    if (watchdogTimer) {
      clearWatchdog();
    }
    const timeoutStage = lastStage;
    llmLogger.error("[langchain_chat] watchdog-timeout", {
      stage: timeoutStage,
      elapsedMs: Date.now() - startTime,
    });
    if (!res.headersSent && !res.writableEnded) {
      respondJson(504, {
        error: "Chat request timed out before response started",
        stage: timeoutStage,
      });
    }
    abortController?.abort();
  };

  const scheduleWatchdog = () => {
    if (watchdogTimer) {
      return;
    }
    watchdogTimer = setTimeout(triggerWatchdog, WATCHDOG_TIMEOUT_MS);
  };

  const ensureStreamStartedEarly = (marker?: string) => {
    if (res.headersSent || earlyStreamStarted) {
      earlyStreamStarted = true;
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    });
    const defaultMarker =
      process.env.NODE_ENV === "production" ? "\n" : "[early-stream]\n";
    res.write(marker ?? defaultMarker);
    const flushHeaders = (res as { flushHeaders?: () => void }).flushHeaders;
    if (typeof flushHeaders === "function") {
      flushHeaders.call(res);
    }
    earlyStreamStarted = true;
  };

  const getHeaderValue = (name: string): string | undefined => {
    const value = req.headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value.find(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      );
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    return undefined;
  };

  const getDebugFlag = (key: string) => {
    if (!debugSurfacesEnabled) {
      return false;
    }
    const queryValue = req.query[key];
    if (Array.isArray(queryValue)) {
      return queryValue.includes("1");
    }
    return queryValue === "1";
  };

  return {
    startTime,
    getLastStage: () => lastStage,
    mark,
    respondJson,
    runStage,
    scheduleWatchdog,
    clearWatchdog,
    setAbortController: (controller) => {
      abortController = controller;
    },
    ensureStreamStartedEarly,
    wasEarlyStreamStarted: () => earlyStreamStarted,
    getHeaderValue,
    getDebugFlag,
    logReturn,
  };
}
