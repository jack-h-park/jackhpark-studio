import type { ExtendedRecordMap, PageBlock } from "notion-types";
import { getBlockCollectionId } from "notion-utils";

/**
 * `collection_id` is present on collection-backed blocks and on collection_view
 * values, but notion-types does not declare it on every variant, so it has to
 * be read defensively rather than asserted.
 */
function readCollectionId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = (value as { collection_id?: unknown }).collection_id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
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
    readCollectionId(block) ??
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
    const viewCollectionId = readCollectionId(viewEntry?.value);
    if (viewCollectionId) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[getPageCollectionId] collection_view parent", {
          pageId,
          parent_table: parentTable,
          parent_id: parentId,
          collectionId: viewCollectionId,
        });
      }
      return viewCollectionId;
    }
  }

  const viewPageBlocks = Object.values(recordMap.block ?? {}).filter(
    (entry) =>
      entry?.value?.type === "collection_view_page" &&
      entry.value?.parent_id === pageId,
  );

  if (viewPageBlocks.length === 1) {
    const foundId = readCollectionId(viewPageBlocks[0]?.value);
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
      const candidate = readCollectionId(entry.value);
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
