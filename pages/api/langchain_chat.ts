import type { NextApiRequest, NextApiResponse } from "next";

import type { ChatRequestBody } from "../../lib/server/chat-common";

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};

function parseRequestBody(req: NextApiRequest): ChatRequestBody | null {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as ChatRequestBody;
    } catch {
      return null;
    }
  }

  if (req.body && typeof req.body === "object") {
    return req.body as ChatRequestBody;
  }

  return null;
}

const WATCHDOG_MS = 10_000;

const hasMessages = (body: ChatRequestBody | null) =>
  Boolean(body && Array.isArray(body.messages) && body.messages.length > 0);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    console.log("[langchain_chat] method-not-allowed", req.method);
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  if (!hasMessages(parseRequestBody(req))) {
    res.status(400).json({
      error: "messages array with at least one entry is required",
    });
    return;
  }

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
      (entryModule as any).handleLangchainChatEntry ??
      (entryModule as any).default ??
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
