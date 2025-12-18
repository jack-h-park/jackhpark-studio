import type { NextApiRequest, NextApiResponse } from "next";

import { isDebugSurfacesEnabled } from "@/lib/server/debug/debug-surfaces";

const debugSurfacesEnabled = isDebugSurfacesEnabled();

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!debugSurfacesEnabled) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.status(200).json({
    stage: "debug-enabled",
    explanation:
      "DEBUG_SURFACES_ENABLED enables deeper diagnostics for langchain_chat imports; toggle query flags to exercise debug flows.",
  });
}
