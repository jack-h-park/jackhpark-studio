import type { NextApiRequest, NextApiResponse } from "next";

import { validateChatRequest } from "../../lib/server/chat-request-validation";

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};

const WATCHDOG_MS = 10_000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const validation = validateChatRequest(req.method, req.body);
  if (!validation.ok) {
    if (validation.status === 405) {
      res.setHeader("Allow", "POST");
      console.log("[langchain_chat] method-not-allowed", req.method);
    }
    res.status(validation.status).json({ error: validation.error });
    return;
  }
  req.body = validation.body;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({
      error: "Server configuration missing Supabase URL or service key",
    });
    return;
  }

  console.log("[langchain_chat] wrapper:post-start");
  let watcher: ReturnType<typeof setTimeout> | null = null;
  const clearWatcher = () => {
    if (watcher) {
      clearTimeout(watcher);
      watcher = null;
    }
  };

  const wrapperTimeout = new Promise<never>((_, reject) => {
    watcher = setTimeout(() => {
      reject(new Error("WRAPPER_IMPORT_TIMEOUT"));
    }, WATCHDOG_MS);
  });

  try {
    console.log("[langchain_chat] wrapper:before-require");
    const importStart = Date.now();
    const entryModule = await Promise.race([
      (async () => {
        // NOTE: keep this import lightweight; entry module should be tiny.
        const entry = await import("../../lib/server/api/langchain_chat_entry");
        console.log(
          "[langchain_chat] wrapper:after-require",
          Date.now() - importStart,
          "ms",
        );
        return entry;
      })(),
      wrapperTimeout,
    ]);
    clearWatcher();

    const handle =
      (entryModule as Record<string, unknown>).handleLangchainChatEntry ??
      (entryModule as Record<string, unknown>).default ??
      entryModule;

    if (typeof handle !== "function") {
      res.status(500).json({
        error: "Server handler export is not a function",
        stage: "wrapper-export",
      });
      return;
    }

    console.log("[langchain_chat] wrapper:before-call");
    await Promise.resolve(handle(req, res));
    console.log("[langchain_chat] wrapper:after-call");
    return;
  } catch (err) {
    clearWatcher();
    if (
      err instanceof Error &&
      err.message === "WRAPPER_IMPORT_TIMEOUT" &&
      !res.headersSent &&
      !res.writableEnded
    ) {
      res.status(504).json({
        error: "Chat request timed out before handler started",
        stage: "wrapper-import",
      });
      return;
    }
    throw err;
  }
}
