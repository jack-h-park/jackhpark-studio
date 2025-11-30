import type { NextApiRequest, NextApiResponse } from "next";

import {
  mergeMetadata,
  normalizeMetadata,
  DOC_TYPE_OPTIONS,
  PERSONA_TYPE_OPTIONS,
  type RagDocumentMetadata,
} from "@/lib/rag/metadata";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type UpdateMetadataBody = {
  docId?: unknown;
  metadata?: unknown;
};

function parseMetadata(input: unknown): RagDocumentMetadata {
  if (!input || typeof input !== "object") {
    return {};
  }

  const data = input as Record<string, unknown>;
  const tags = Array.isArray(data.tags)
    ? data.tags
        .map((tag) =>
          typeof tag === "string"
            ? tag.trim()
            : typeof tag === "number"
              ? String(tag)
              : null,
        )
        .filter((tag): tag is string => Boolean(tag))
    : undefined;

  const metadata: RagDocumentMetadata = {};

  if (typeof data.source_type === "string" && data.source_type) {
    metadata.source_type = data.source_type;
  }
  if (typeof data.doc_type === "string" && data.doc_type) {
    if ((DOC_TYPE_OPTIONS as readonly string[]).includes(data.doc_type)) {
      metadata.doc_type = data.doc_type as any;
    }
  }
  if (typeof data.persona_type === "string" && data.persona_type) {
    if (
      (PERSONA_TYPE_OPTIONS as readonly string[]).includes(data.persona_type)
    ) {
      metadata.persona_type = data.persona_type as any;
    }
  }
  if (typeof data.is_public === "boolean") {
    metadata.is_public = data.is_public;
  }
  if (tags && tags.length > 0) {
    metadata.tags = tags;
  }

  return metadata;
}

export const config = {
  runtime: "nodejs",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const body: UpdateMetadataBody =
    typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};

  const docId =
    typeof body.docId === "string" && body.docId.trim().length > 0
      ? body.docId.trim()
      : null;
  if (!docId) {
    res.status(400).json({ error: "Missing docId." });
    return;
  }

  const incomingMetadata = normalizeMetadata(parseMetadata(body.metadata));

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from("rag_documents")
    .select("doc_id, metadata")
    .eq("doc_id", docId)
    .maybeSingle();

  if (fetchError) {
    res.status(500).json({ error: fetchError.message });
    return;
  }

  if (!existing) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  const mergedMetadata = mergeMetadata(
    normalizeMetadata(existing.metadata as RagDocumentMetadata | null),
    incomingMetadata,
  );

  const { data: updated, error: updateError } = await supabase
    .from("rag_documents")
    .update({
      metadata: mergedMetadata,
      last_ingested_at: new Date().toISOString(),
    })
    .eq("doc_id", docId)
    .select(
      "doc_id, source_url, last_ingested_at, last_source_update, chunk_count, total_characters, metadata",
    )
    .single();

  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }

  res.status(200).json({
    document: updated,
  });
}
