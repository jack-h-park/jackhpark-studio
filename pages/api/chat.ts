import type { NextApiRequest, NextApiResponse } from "next";

import { loadChatModelSettings } from "@/lib/server/chat-settings";

import langchainChat from "./langchain_chat";
import nativeChat from "./native_chat";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const runtime = await loadChatModelSettings({ forceRefresh: true });
  (req as any).chatRuntime = runtime;
  const engine = runtime.engine;

  if (engine === "native") {
    await nativeChat(req, res);
    return;
  }

  await langchainChat(req, res);
}
