import type { ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import { rootNotionPageId } from "@/lib/config";
import { getPage } from "@/lib/notion";
import { unwrapRecordValue } from "@/lib/rag/notion-record-value";

export type NotionNavigationHeader = {
  headerRecordMap: ExtendedRecordMap | null;
  headerBlockId: string;
};

export async function loadNotionNavigationHeader(): Promise<NotionNavigationHeader> {
  const canonicalRootPageId =
    parsePageId(rootNotionPageId, { uuid: true }) ?? rootNotionPageId;
  const normalizedRootPageId = canonicalRootPageId.replaceAll("-", "");

  try {
    const recordMap = await getPage(canonicalRootPageId);
    const rawBlockEntry =
      recordMap.block?.[canonicalRootPageId] ??
      recordMap.block?.[normalizedRootPageId] ??
      recordMap.block?.[rootNotionPageId];

    if (rawBlockEntry) {
      // Was a second, local copy of the {value:{value}} unwrap. That is what
      // lib/rag/notion-record-value.ts exists to be the single owner of — two
      // copies is how the double-nesting bug got missed the first time.
      const normalizedValue = unwrapRecordValue<{ id?: string }>(rawBlockEntry);
      const blockEntry = {
        ...rawBlockEntry,
        value: {
          ...normalizedValue,
          id: normalizedValue?.id ?? canonicalRootPageId ?? rootNotionPageId,
        },
      } as typeof rawBlockEntry;

      const trimmedRecordMap: ExtendedRecordMap = {
        block: {
          [canonicalRootPageId]: blockEntry,
          [normalizedRootPageId]: blockEntry,
        },
        collection: {},
        collection_query: {},
        collection_view: {},
        notion_user: {},
        signed_urls: recordMap.signed_urls ?? {},
      };

      return {
        headerRecordMap: trimmedRecordMap,
        headerBlockId: canonicalRootPageId,
      };
    }
  } catch (err) {
    console.warn("[notion-header] failed to load root page record map", err);
  }

  return {
    headerRecordMap: null,
    headerBlockId: canonicalRootPageId,
  };
}
