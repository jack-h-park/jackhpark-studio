import type { NextApiRequest, NextApiResponse } from "next";

const CHAT_DEBUG = process.env.CHAT_DEBUG === "1";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!CHAT_DEBUG) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.status(200).json({
    stage: "debug-enabled",
    explanation:
      "CHAT_DEBUG=1 allows deep insights into langchain_chat imports; toggle query flags to exercise debug flows.",
  });
}
