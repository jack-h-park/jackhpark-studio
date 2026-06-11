// scripts/audit-doc-id-canonical.ts
//
// One-off diagnostic for the doc_id normalization behavior change in PR #9.
// Manual URL ingestion previously stored doc_id = raw URL; it now stores the
// canonical (dash-stripped, lowercased) 32-char form via deriveDocIdentifiers.
// Pre-existing rows keyed by a raw URL therefore remain non-canonical until
// re-ingested. This script enumerates rows whose doc_id is NOT a 32-char hex
// string so we can decide which to re-ingest and which old rows to prune.
//
// Read-only. Usage: pnpm tsx scripts/audit-doc-id-canonical.ts

import { startDbQuery } from "@/lib/logging/db-logger";

import { supabaseClient } from "../lib/core/supabase";

const CANONICAL_DOC_ID_REGEX = /^[0-9a-f]{32}$/;
const DOC_BATCH_SIZE = 250;

type DocRow = {
  doc_id: string;
  raw_doc_id: string | null;
  source_url: string | null;
};

type NonCanonicalRow = DocRow & {
  looksLikeUrl: boolean;
};

async function main(): Promise<void> {
  const nonCanonical: NonCanonicalRow[] = [];
  let total = 0;
  let pageOffset = 0;

  while (true) {
    const tracker = startDbQuery({
      action: "auditDocIdCanonical:scan",
      table: "rag_documents",
      operation: "select",
    });
    const { data, error } = await supabaseClient
      .from("rag_documents")
      .select("doc_id, raw_doc_id, source_url")
      .range(pageOffset, pageOffset + DOC_BATCH_SIZE - 1);

    if (error) {
      tracker.error(error);
      throw error;
    }
    tracker.done({ rowCount: data?.length ?? 0 });

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data as DocRow[]) {
      total += 1;
      if (!row.doc_id || CANONICAL_DOC_ID_REGEX.test(row.doc_id)) {
        continue;
      }
      nonCanonical.push({
        ...row,
        looksLikeUrl: /^https?:\/\//i.test(row.doc_id),
      });
    }

    pageOffset += DOC_BATCH_SIZE;
  }

  console.log("\n=== doc_id canonical-form audit ===");
  console.log(`Total rag_documents scanned: ${total}`);
  console.log(`Non-canonical doc_id rows:   ${nonCanonical.length}`);

  if (nonCanonical.length === 0) {
    console.log("\nAll doc_ids are canonical 32-char hex. Nothing to clean up.");
    return;
  }

  const urlKeyed = nonCanonical.filter((r) => r.looksLikeUrl);
  const other = nonCanonical.filter((r) => !r.looksLikeUrl);

  console.log(`  - URL-keyed (raw-URL doc_id): ${urlKeyed.length}`);
  console.log(`  - Other non-canonical:        ${other.length}`);

  console.log("\nURL-keyed rows (re-ingest these via the URL adapter, then");
  console.log("delete the old raw-URL row + its chunks):");
  for (const row of urlKeyed) {
    console.log(`  doc_id=${row.doc_id}`);
  }

  if (other.length > 0) {
    console.log("\nOther non-canonical rows (inspect individually):");
    for (const row of other) {
      console.log(
        `  doc_id=${row.doc_id} raw_doc_id=${row.raw_doc_id ?? "null"} source_url=${row.source_url ?? "null"}`,
      );
    }
  }

  console.log(
    "\nNote: re-ingesting a URL writes a NEW canonical-id row; the old row is\n" +
      "not removed automatically. Prune old rows + their chunks after verifying\n" +
      "the canonical row exists.",
  );
}

await main();
