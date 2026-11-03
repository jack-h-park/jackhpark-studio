import type { NextApiRequest, NextApiResponse } from "next";

import type { ChatRuntimeRequest } from "@/lib/server/chat-runtime-request";
import type { SessionChatConfig } from "@/types/chat-config";
import { llmLogger } from "@/lib/logging/logger";
import { validateChatRequest } from "@/lib/server/chat-request-validation";
import { loadChatModelSettings } from "@/lib/server/chat-settings";

import langchainChat from "./langchain_chat";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const validation = validateChatRequest(req.method, req.body);
  if (!validation.ok) {
    if (validation.status === 405) res.setHeader("Allow", "POST");
    res.status(validation.status).json({ error: validation.error });
    return;
  }
  req.body = validation.body;

  llmLogger.debug("[api/chat] entering", {
    method: req.method,
    url: req.url,
  });

  let engine: string | undefined;

  try {
    const runtime = await loadChatModelSettings({
      sessionConfig: validation.body.config as SessionChatConfig | undefined,
    });
    (req as ChatRuntimeRequest).chatRuntime = runtime;
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
