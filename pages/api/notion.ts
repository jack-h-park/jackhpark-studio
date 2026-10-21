//pages/api/notion.ts
import type { NextApiRequest, NextApiResponse } from "next";

import { domain } from "@/lib/config";
import { isSupportedNotionRoute } from "@/lib/notion-route";
import { resolveNotionPage } from "@/lib/resolve-notion-page";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = req.query.id;
  if (!isSupportedNotionRoute(id) || id.length > 256) {
    return res.status(400).json({ error: "Invalid or missing id parameter" });
  }

  try {
    const data = await resolveNotionPage(domain, id);
    if (data.error) {
      const code = data.error.statusCode;
      const status =
        Number.isInteger(code) && code >= 400 && code <= 599 ? code : 500;
      return res.status(status).json(data);
    }
    if (!data.recordMap) {
      return res.status(500).json({ error: "Incomplete page response" });
    }
    // This endpoint resolves public content only. Bound side-peek staleness to
    // one minute; authenticated or variant requests must never share its cache.
    if (
      !req.headers.authorization &&
      !res.getHeader("Set-Cookie") &&
      Object.keys(req.query).every((key) => key === "id")
    ) {
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    }
    res.status(200).json(data);
  } catch {
    res.status(404).json({ error: "Page not found" });
  }
}
