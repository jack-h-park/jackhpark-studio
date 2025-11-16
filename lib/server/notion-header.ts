import type { ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import { rootNotionPageId } from "@/lib/config";
import { getPage } from "@/lib/notion";

export type NotionNavigationHeader = {
  headerRecordMap: ExtendedRecordMap | null;
  headerBlockId: string;
};

export async function loadNotionNavigationHeader(): Promise<NotionNavigationHeader> {
  const canonicalRootPageId =
    parsePageId(rootNotionPageId, { uuid: true }) ?? rootNotionPageId;

  try {
    const recordMap = await getPage(canonicalRootPageId);
    const blockEntry =
      recordMap.block?.[canonicalRootPageId] ??
      recordMap.block?.[rootNotionPageId];

    if (blockEntry) {
      const trimmedRecordMap: ExtendedRecordMap = {
        block: {
          [canonicalRootPageId]: blockEntry,
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
