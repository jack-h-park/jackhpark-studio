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
  const normalizedRootPageId = canonicalRootPageId.replaceAll("-", "");

  try {
    const recordMap = await getPage(canonicalRootPageId);
    const rawBlockEntry =
      recordMap.block?.[canonicalRootPageId] ??
      recordMap.block?.[normalizedRootPageId] ??
      recordMap.block?.[rootNotionPageId];

    if (rawBlockEntry) {
      const rawValue = (rawBlockEntry as any).value;
      const normalizedValue =
        rawValue &&
        typeof rawValue === "object" &&
        rawValue.value &&
        typeof rawValue.value === "object"
          ? rawValue.value
          : rawValue;
      const blockEntry = {
        ...(rawBlockEntry as any),
        value: {
          ...(normalizedValue as any),
          id:
            (normalizedValue as any)?.id ??
            canonicalRootPageId ??
            rootNotionPageId,
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
