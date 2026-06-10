import type { PreparedDocument } from "../pipeline";
import { supabaseClient } from "../../core/supabase";
import { deriveDocIdentifiers } from "../../server/doc-identifiers";
import { type ExtractedArticle, extractMainContent } from "../index";
import {
  applyDefaultDocMetadata,
  DEFAULT_INGEST_DOC_TYPE,
  DEFAULT_INGEST_PERSONA_TYPE,
  mergeRagDocumentMetadata,
} from "../metadata";
import { markAttempt, markFetchFailure } from "../rag-document-lifecycle";
import { buildUrlRagDocumentMetadata } from "../url-metadata";

/**
 * Fetch and parse a URL into a PreparedDocument. Marks the lifecycle attempt
 * before fetching and classifies fetch failures before rethrowing.
 * ID-sensitive ingestion path: doc_id/raw_doc_id must come from deriveDocIdentifiers.
 */
export async function fetchUrlDocument(url: string): Promise<PreparedDocument> {
  const normalizedUrl = url.trim();
  const { canonicalId, rawId } = deriveDocIdentifiers(normalizedUrl);

  await markAttempt(supabaseClient, canonicalId);

  let article: ExtractedArticle;
  try {
    article = await extractMainContent(normalizedUrl);
  } catch (err) {
    await markFetchFailure(supabaseClient, canonicalId, err);
    throw err;
  }

  return {
    canonicalId,
    rawId,
    label: `URL "${article.title}" (${normalizedUrl})`,
    sourceUrl: normalizedUrl,
    title: article.title,
    text: article.text,
    lastSourceUpdate: article.lastModified,
    statusCode: article.statusCode,
    changeDetection: "hash-and-timestamp",
    buildMetadata: async (existingMetadata) => {
      const sourceMetadata = await buildUrlRagDocumentMetadata({
        sourceUrl: normalizedUrl,
        htmlTitle: article.title,
      });
      const mergedMetadata = mergeRagDocumentMetadata(
        existingMetadata,
        sourceMetadata,
      );
      return applyDefaultDocMetadata(mergedMetadata, {
        doc_type: DEFAULT_INGEST_DOC_TYPE,
        persona_type: DEFAULT_INGEST_PERSONA_TYPE,
      });
    },
  };
}
