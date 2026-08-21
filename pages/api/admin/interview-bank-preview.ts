import type { NextApiRequest, NextApiResponse } from "next";

import { previewInterviewBank } from "@/lib/rag/sources/interview-bank";

/**
 * What the next interview-bank ingest would publish, without publishing it.
 *
 * Read-only: it fetches the card files and applies the same eligibility decision the ingest
 * uses (`inspectInterviewCard`), then stops. Nothing is embedded, no run is recorded.
 *
 * This exists because the section filter's failure mode is silent and public — a card's
 * `## Gaps` or an internal repo path reaching the assistant breaks nothing and announces
 * nothing. Reading the exact text before it is embedded is the only cheap way to catch it.
 *
 * Auth is the dashboard's HTTP Basic (middleware matches /api/admin/*).
 */
export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const preview = await previewInterviewBank();
    response.status(200).json({ ok: true, ...preview });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The likely cause is a missing or expired INTERVIEW_BANK_GITHUB_TOKEN; the adapter
    // says so in the message, and a preview that fails silently would be worthless.
    response.status(500).json({ ok: false, error: message });
  }
}
