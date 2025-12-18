import type { NextApiRequest, NextApiResponse } from "next";

import { isChatDebugEnabled } from "@/lib/server/debug/chat-debug";

const chatDebugEnabled = isChatDebugEnabled();

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!chatDebugEnabled) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.status(200).json({
    stage: "debug-enabled",
    explanation:
      "CHAT_DEBUG=1 unlocks deeper diagnostics for langchain_chat imports; toggle query flags to exercise debug flows.",
  });
}
