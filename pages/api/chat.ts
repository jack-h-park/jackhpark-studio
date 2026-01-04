import type { NextApiRequest, NextApiResponse } from "next";

import { llmLogger } from "@/lib/logging/logger";
import { loadChatModelSettings } from "@/lib/server/chat-settings";

import langchainChat from "./langchain_chat";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  llmLogger.debug("[api/chat] entering", {
    method: req.method,
    url: req.url,
  });

  // Basic CORS or method check could go here if needed...
  let engine: string | undefined;

  try {
    const runtime = await loadChatModelSettings({
      forceRefresh: true,
      sessionConfig: req.body?.config,
    });
    (req as any).chatRuntime = runtime;
    engine = runtime.engine;

    llmLogger.debug("[api/chat] dispatch", {
      engine,
      method: req.method,
      safeMode: runtime.safeMode,
    });
    await langchainChat(req, res);
  } catch (err) {
    llmLogger.error("[api/chat] handler error", { error: err });
    if (!res.writableEnded) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  } finally {
    if (!res.writableEnded) {
      llmLogger.error("[api/chat] response not ended before exit", {
        engine: engine ?? null,
      });
      // Safety net: ensure we don't leave the request hanging
      res.end();
    }
    llmLogger.debug("[api/chat] exiting", {
      sent: res.writableEnded,
    });
  }
}
