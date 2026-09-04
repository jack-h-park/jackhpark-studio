import type { NextApiRequest, NextApiResponse } from "next";

import { errorMessageOrUndefined } from "@/lib/error-message";
import { loadChatModelSettings } from "@/lib/server/chat-settings";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const models = await loadChatModelSettings({ forceRefresh: true });
    return res.status(200).json({ models });
  } catch (err: unknown) {
    console.error("[api/chat-config] failed to load chat model settings", err);
    return res.status(500).json({
      error:
        errorMessageOrUndefined(err) ?? "Failed to load chat configuration.",
    });
  }
}
