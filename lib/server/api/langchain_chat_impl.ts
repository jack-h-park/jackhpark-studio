import { createRequire } from "node:module";

import type { NextApiRequest, NextApiResponse } from "next";

import type * as HeavyModule from "./langchain_chat_impl_heavy";

const WATCHDOG_MS =
  process.env.NODE_ENV === "production" ? 10_000 : 60_000;

const heavyImportTarget = "./langchain_chat_impl_heavy";
const requireHeavy = createRequire(import.meta.url);
const importHeavy = async () =>
  requireHeavy("./langchain_chat_impl_heavy");
let heavyPromise: Promise<typeof HeavyModule> | null = null;
const getHeavy = () => {
  if (!heavyPromise) {
    heavyPromise = importHeavy().catch((err) => {
      heavyPromise = null;
      throw err;
    });
  }
  return heavyPromise;
};

const shouldPrewarm =
  process.env.NODE_ENV !== "production" &&
  process.env.NODE_ENV !== "test" &&
  process.env.NEXT_RUNTIME !== "edge";

if (shouldPrewarm) {
  const startPrewarm = () => {
    console.log("[langchain_chat_impl] prewarm:start");
    const prewarmStart = Date.now();
    getHeavy()
      .then(() => {
        console.log(
          "[langchain_chat_impl] prewarm:done",
          Date.now() - prewarmStart,
          "ms",
        );
      })
      .catch((err) => {
        console.error(
          "[langchain_chat_impl] prewarm:error",
          err instanceof Error ? err.message : err,
        );
      });
  };

  const globalAny = globalThis as unknown as Record<string, unknown>;
  if (!globalAny.__langchainChatPrewarmDone) {
    globalAny.__langchainChatPrewarmDone = true;
    startPrewarm();
  }
}


const isDev = process.env.NODE_ENV !== "production";

function logResourceSnapshot(stage: string) {
  if (!isDev) {
    return;
  }
  const { rss, heapUsed } = process.memoryUsage();
  console.log(`[langchain_chat_impl] ${stage}`, {
    time: Date.now(),
    uptime: process.uptime(),
    rss,
    heapUsed,
  });
}

export async function handleLangchainChat(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("[langchain_chat_impl] shim:start");
  const startedAt = Date.now();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("IMPL_HEAVY_IMPORT_TIMEOUT")),
      WATCHDOG_MS,
    );
  });

  try {
    console.log("[langchain_chat_impl] shim:before-import-heavy");
    logResourceSnapshot("shim:before-import-heavy");
    console.log("[langchain_chat_impl] shim:import-target", heavyImportTarget);
    const mod = await Promise.race([getHeavy(), timeout]);
    clearTimer();

    console.log(
      "[langchain_chat_impl] shim:import-heavy-done",
      Date.now() - startedAt,
      "ms",
    );
    logResourceSnapshot("shim:after-import-heavy");

    const heavy = (mod as any).handleLangchainChat;
    if (typeof heavy !== "function") {
      res.status(500).json({
        error: "Heavy handler export is not a function",
        stage: "impl-export",
      });
      return;
    }

    await heavy(req, res);
    return;
  } catch (err) {
    clearTimer();

    if (
      err instanceof Error &&
      err.message === "IMPL_HEAVY_IMPORT_TIMEOUT" &&
      !res.headersSent &&
      !res.writableEnded
    ) {
      const timeoutErr = err as Error & { code?: string };
      console.warn("[langchain_chat_impl] shim:error", {
        stage: "impl-import-heavy",
        code: timeoutErr.code,
        message: timeoutErr.message,
      });
      res.status(504).json({
        error: "Chat request timed out while loading heavy impl",
        stage: "impl-import-heavy",
        watchdogMs: WATCHDOG_MS,
        env: process.env.NODE_ENV,
        target: heavyImportTarget,
      });
      return;
    }

    const errMessage = err instanceof Error ? err.message : String(err);
    const errCode =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    const isModuleNotFound =
      errCode === "MODULE_NOT_FOUND" ||
      errCode === "ERR_MODULE_NOT_FOUND" ||
      errMessage.includes("Cannot find module") ||
      errMessage.includes("ERR_MODULE_NOT_FOUND");

    if (
      isModuleNotFound &&
      !res.headersSent &&
      !res.writableEnded
    ) {
      console.warn("[langchain_chat_impl] shim:error", {
        stage: "impl-module-not-found",
        code: errCode,
        message: errMessage,
      });
      res.status(500).json({
        error: "Failed to load heavy handler module",
        stage: "impl-module-not-found",
        target: heavyImportTarget,
        code: errCode,
        message: errMessage,
      });
      return;
    }

    if (!res.headersSent && !res.writableEnded) {
      console.warn("[langchain_chat_impl] shim:error", {
        stage: "impl-unexpected",
        code: errCode,
        message: errMessage,
      });
      res.status(500).json({
        error: "Unexpected error while loading or executing heavy handler",
        stage: "impl-unexpected",
        target: heavyImportTarget,
        code: errCode,
        message: errMessage,
      });
      return;
    }

    console.error(
      "[langchain_chat_impl] unexpected error after headers sent",
      err,
    );
    return;
  }
}

export default handleLangchainChat;
