import type { NextApiRequest, NextApiResponse } from "next";

const CHAT_DEBUG = process.env.CHAT_DEBUG === "1";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!CHAT_DEBUG) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  const start = Date.now();
  await import("@/lib/server/api/langchain_chat_impl_heavy");
  res.status(200).json({
    ok: true,
    elapsedMs: Date.now() - start,
  });
}
