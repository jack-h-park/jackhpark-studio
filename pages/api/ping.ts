import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("[ping] hit", req.method);
  res.status(200).json({ ok: true, method: req.method });
}
