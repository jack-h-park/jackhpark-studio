import { type ExtendedRecordMap } from "notion-types";

import type { PreparedDocument } from "../pipeline";
import {
  deriveDocIdentifiers,
  type DocIdentifiers,
} from "../../server/doc-identifiers";
import { formatNotionPageId } from "../../server/page-url";
import {
  extractPlainText,
  getPageLastEditedTime,
  getPageTitle,
  getPageUrl,
} from "../index";
import {
  applyDefaultDocMetadata,
  DEFAULT_INGEST_DOC_TYPE,
  DEFAULT_INGEST_PERSONA_TYPE,
  mergeMetadata,
  mergeRagDocumentMetadata,
} from "../metadata";
import {
  buildNotionSourceMetadata,
  extractNotionMetadata,
} from "../notion-metadata";
import { normalizeNotionRecordMap } from "../notion-record-value";

/**
 * ID-sensitive ingestion path: doc_id/raw_doc_id must always come from
 * deriveDocIdentifiers over the dashed Notion page ID.
 */
export function deriveNotionDocIdentifiers(pageId: string): DocIdentifiers {
  const rawNotionId = formatNotionPageId(pageId) ?? pageId;
  return deriveDocIdentifiers(rawNotionId);
}

export function prepareNotionPageDocument(
  recordMap: ExtendedRecordMap,
  pageId: string,
): PreparedDocument {
  const { canonicalId, rawId } = deriveNotionDocIdentifiers(pageId);
  const normalizedRecordMap = normalizeNotionRecordMap(recordMap);
  // recordMap.block is keyed by dashed UUIDs; a compact pageId (CLI --page
  // input) would silently miss every lookup, so always use the dashed rawId.
  const lookupId = rawId;
  const title = getPageTitle(normalizedRecordMap, lookupId);

  return {
    canonicalId,
    rawId,
    label: `Notion page "${title}" (${pageId})`,
    sourceUrl: getPageUrl(pageId),
    title,
    text: extractPlainText(normalizedRecordMap, lookupId),
    lastSourceUpdate: getPageLastEditedTime(normalizedRecordMap, lookupId),
    statusCode: 200,
    changeDetection: "hash",
    buildMetadata: (existingMetadata) => {
      // Admin-editable fields win over freshly extracted page properties,
      // which in turn win over derived source metadata (icon, breadcrumb, teaser).
      const incomingMetadata = extractNotionMetadata(normalizedRecordMap, lookupId);
      const sourceMetadata = buildNotionSourceMetadata(normalizedRecordMap, lookupId);
      const adminMetadata =
        mergeMetadata(existingMetadata, incomingMetadata) ??
        existingMetadata ??
        null;
      const mergedMetadata = mergeRagDocumentMetadata(
        adminMetadata ?? undefined,
        sourceMetadata,
      );
      return applyDefaultDocMetadata(mergedMetadata, {
        doc_type: DEFAULT_INGEST_DOC_TYPE,
        persona_type: DEFAULT_INGEST_PERSONA_TYPE,
      });
    },
  };
}
