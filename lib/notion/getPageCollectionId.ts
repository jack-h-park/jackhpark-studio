import type { ExtendedRecordMap, PageBlock } from "notion-types";
import { getBlockCollectionId } from "notion-utils";

const normalizeId = (id?: string | null): string | undefined =>
  id?.replace(/-/g, "");

function findCollectionIdFromViewBlock(
  recordMap: ExtendedRecordMap,
  viewBlock: Partial<PageBlock> | undefined | null,
): string | null {
  if (!viewBlock?.collection_id) {
    return null;
  }

  return viewBlock.collection_id;
}

export function getPageCollectionId(
  recordMap?: ExtendedRecordMap | null,
  pageId?: string | null,
): string | null {
  if (!recordMap || !pageId) {
    return null;
  }

  const rawBlock = recordMap.block?.[pageId];
  const block = rawBlock?.value as PageBlock | undefined;

  const parentTable = block?.parent_table ?? null;
  const parentId = block?.parent_id ?? null;
  const blockCollectionId =
    block?.collection_id ??
    (block ? getBlockCollectionId(block, recordMap) : undefined);

  if (blockCollectionId) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[getPageCollectionId] direct block collection_id", {
        pageId,
        parent_table: parentTable,
        parent_id: parentId,
        collectionId: blockCollectionId,
      });
    }
    return blockCollectionId;
  }

  if (parentTable === "collection" && parentId) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[getPageCollectionId] parent table collection", {
        pageId,
        parent_table: parentTable,
        parent_id: parentId,
      });
    }
    return parentId;
  }

  if (parentTable === "collection_view" && parentId) {
    const viewEntry = recordMap.collection_view?.[parentId];
    const viewValue = viewEntry?.value;
    if (viewValue?.collection_id) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[getPageCollectionId] collection_view parent", {
          pageId,
          parent_table: parentTable,
          parent_id: parentId,
          collectionId: viewValue.collection_id,
        });
      }
      return viewValue.collection_id;
    }
  }

  const viewPageBlocks = Object.values(recordMap.block ?? {}).filter(
    (entry) =>
      entry?.value?.type === "collection_view_page" &&
      entry.value?.parent_id === pageId,
  );

  if (viewPageBlocks.length === 1) {
    const foundId = findCollectionIdFromViewBlock(
      recordMap,
      viewPageBlocks[0]?.value,
    );
    if (foundId) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[getPageCollectionId] fallback single view page", {
          pageId,
          collectionId: foundId,
        });
      }
      return foundId;
    }
  }

  for (const entry of Object.values(recordMap.block ?? {})) {
    if (entry?.value?.type === "collection_view_page") {
      const candidate = findCollectionIdFromViewBlock(recordMap, entry.value);
      if (candidate) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[getPageCollectionId] fallback any view page", {
            pageId,
            candidate,
          });
        }
        return candidate;
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("[getPageCollectionId] no collection found", {
      pageId,
      parent_table: parentTable,
      parent_id: parentId,
    });
  }

  return null;
}
