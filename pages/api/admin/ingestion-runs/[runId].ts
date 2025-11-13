import type { NextApiRequest, NextApiResponse } from "next";

import { normalizeRunRecord, type RunRecord } from "@/lib/admin/ingestion-runs";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type DeleteResponse = {
  run: RunRecord;
};

function getRunId(query: NextApiRequest["query"]): string | null {
  const { runId } = query;
  if (typeof runId === "string" && runId.trim().length > 0) {
    return runId.trim();
  }
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DeleteResponse | { error: string }>,
): Promise<void> {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const runId = getRunId(req.query);
  if (!runId) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("rag_ingest_runs")
    .delete()
    .eq("id", runId)
    .select(
      "id, source, ingestion_type, partial_reason, status, started_at, ended_at, duration_ms, documents_processed, documents_added, documents_updated, documents_skipped, chunks_added, chunks_updated, characters_added, characters_updated, error_count, error_logs, metadata",
    )
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  res.status(200).json({ run: normalizeRunRecord(data) });
}
