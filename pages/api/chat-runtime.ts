import type { NextApiRequest, NextApiResponse } from "next";

import { errorMessageOrUndefined } from "@/lib/error-message";
import {
  cachePublicSettingsResponse,
  loadPublicSettings,
} from "@/lib/server/public-settings-api";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const runtime = await loadPublicSettings();
    cachePublicSettingsResponse(req, res);
    return res.status(200).json({ runtime });
  } catch (err: unknown) {
    console.error("[api/chat-runtime] failed to load chat runtime", err);
    return res.status(500).json({
      error: errorMessageOrUndefined(err) ?? "Failed to load chat runtime.",
    });
  }
}
