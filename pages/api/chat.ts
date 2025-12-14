import type { NextApiRequest, NextApiResponse } from "next";

import { loadChatModelSettings } from "@/lib/server/chat-settings";

import langchainChat from "./langchain_chat";
import nativeChat from "./native_chat";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("[api/chat] entering", {
    method: req.method,
    ended: res.writableEnded,
  });
  let engine: string | undefined;
  try {
    const runtime = await loadChatModelSettings({
      forceRefresh: true,
      sessionConfig: req.body?.config,
    });
    (req as any).chatRuntime = runtime;
    engine = runtime.engine;
    console.log("[api/chat] dispatch", { engine, method: req.method });

    if (engine === "native") {
      await nativeChat(req, res);
    } else {
      await langchainChat(req, res);
    }
  } catch (err) {
    console.error("[api/chat] handler error", err);
    if (!res.headersSent && !res.writableEnded) {
      res.status(500).json({ error: "Internal Server Error" });
    } else if (!res.writableEnded) {
      res.end();
    }
  } finally {
    if (!res.writableEnded) {
      console.warn("[api/chat] response not ended before exit", {
        engine: engine ?? null,
        headersSent: res.headersSent,
      });
    }
    console.log("[api/chat] exiting", {
      engine: engine ?? null,
      ended: res.writableEnded,
      headersSent: res.headersSent,
    });
  }
}
