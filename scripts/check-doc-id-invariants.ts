import { supabaseClient } from "../lib/core/supabase";

const DOC_BATCH_SIZE = 250;
const CHUNK_BATCH_SIZE = 500;

type DocScanResult = {
  docIdSet: Set<string>;
  metadataDocIdMismatch: number;
  metadataRawDocIdMismatch: number;
  docIdMismatchSamples: Array<{
    docId: string;
    metadataDocId: string | null;
  }>;
  rawDocIdMismatchSamples: Array<{
    docId: string;
    rawDocId: string | null;
    metadataRawDocId: string | null;
  }>;
};

async function gatherDocumentStats(): Promise<DocScanResult> {
  const docIdSet = new Set<string>();
  const docIdMismatchSamples: DocScanResult["docIdMismatchSamples"] = [];
  const rawDocIdMismatchSamples: DocScanResult["rawDocIdMismatchSamples"] = [];
  let metadataDocIdMismatch = 0;
  let metadataRawDocIdMismatch = 0;
  let pageOffset = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from("rag_documents")
      .select(
        "doc_id, raw_doc_id, metadata->>doc_id AS metadata_doc_id, metadata->>raw_doc_id AS metadata_raw_doc_id",
      )
      .range(pageOffset, pageOffset + DOC_BATCH_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const docId = row.doc_id;
      if (!docId) {
        continue;
      }
      docIdSet.add(docId);

      const metadataDocId = row.metadata_doc_id ?? null;
      if (metadataDocId !== docId) {
        metadataDocIdMismatch += 1;
        if (docIdMismatchSamples.length < 5) {
          docIdMismatchSamples.push({ docId, metadataDocId });
        }
      }

      const metadataRawDocId = row.metadata_raw_doc_id ?? null;
      if (row.raw_doc_id && metadataRawDocId !== row.raw_doc_id) {
        metadataRawDocIdMismatch += 1;
        if (rawDocIdMismatchSamples.length < 5) {
          rawDocIdMismatchSamples.push({
            docId,
            rawDocId: row.raw_doc_id,
            metadataRawDocId,
          });
        }
      }
    }

    pageOffset += DOC_BATCH_SIZE;
  }

  return {
    docIdSet,
    metadataDocIdMismatch,
    metadataRawDocIdMismatch,
    docIdMismatchSamples,
    rawDocIdMismatchSamples,
  };
}

async function verifyChunkDocIds(
  docIdSet: Set<string>,
): Promise<{
  missingDocCount: number;
  missingDocSamples: string[];
}> {
  let chunkOffset = 0;
  let missingDocCount = 0;
  const missingDocSamples: string[] = [];

  while (true) {
    const { data, error } = await supabaseClient
      .from("rag_chunks_openai_te3s_v1")
      .select("doc_id")
      .range(chunkOffset, chunkOffset + CHUNK_BATCH_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const docId = row.doc_id;
      if (!docId || docIdSet.has(docId)) {
        continue;
      }
      missingDocCount += 1;
      if (missingDocSamples.length < 5) {
        missingDocSamples.push(docId);
      }
    }

    chunkOffset += CHUNK_BATCH_SIZE;
  }

  return { missingDocCount, missingDocSamples };
}

console.log("📊 Checking doc_id / raw_doc_id invariants...");

try {
  const docStats = await gatherDocumentStats();
  const chunkStats = await verifyChunkDocIds(docStats.docIdSet);

  console.log("✅ Document metadata checks:");
  console.log(
    `  doc_id vs metadata->>doc_id mismatches: ${docStats.metadataDocIdMismatch}`,
  );
  if (docStats.docIdMismatchSamples.length > 0) {
    console.log("    Samples:", docStats.docIdMismatchSamples);
  }
  console.log(
    `  raw_doc_id vs metadata->>raw_doc_id mismatches: ${docStats.metadataRawDocIdMismatch}`,
  );
  if (docStats.rawDocIdMismatchSamples.length > 0) {
    console.log("    Samples:", docStats.rawDocIdMismatchSamples);
  }

  console.log(
    `✅ Chunk table references missing docs: ${chunkStats.missingDocCount}`,
  );
  if (chunkStats.missingDocSamples.length > 0) {
    console.log("    Missing doc_id samples:", chunkStats.missingDocSamples);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
