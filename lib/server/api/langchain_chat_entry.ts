import type { NextApiRequest, NextApiResponse } from "next";

const WATCHDOG_MS = 10_000;

/**
 * Tiny entrypoint to keep `pages/api/langchain_chat` fast to load in dev.
 * IMPORTANT: This module must stay lightweight (no heavy imports at top-level).
 */
export async function handleLangchainChatEntry(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("[langchain_chat_entry] import-start");
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
      () => reject(new Error("ENTRY_IMPORT_TIMEOUT")),
      WATCHDOG_MS,
    );
  });

  try {
    const mod = await Promise.race([import("./langchain_chat_impl"), timeout]);
    clearTimer();

    console.log(
      "[langchain_chat_entry] import-done",
      Date.now() - startedAt,
      "ms",
    );

    const handleLangchainChat = (mod as any).handleLangchainChat;
    if (typeof handleLangchainChat !== "function") {
      return res.status(500).json({
        error: "Impl handler export is not a function",
        stage: "entry-export",
      });
    }

    await Promise.resolve(handleLangchainChat(req, res));

    if (!res.headersSent && !res.writableEnded) {
      res.status(500).json({
        error: "Handler returned without sending a response",
        stage: "entry-no-response",
      });
      return;
    }
  } catch (err) {
    clearTimer();

    if (
      err instanceof Error &&
      err.message === "ENTRY_IMPORT_TIMEOUT" &&
      !res.headersSent &&
      !res.writableEnded
    ) {
      return res.status(504).json({
        error: "Chat request timed out before handler loaded",
        stage: "entry-import-impl",
      });
    }

    throw err;
  }
}

export default handleLangchainChatEntry;
