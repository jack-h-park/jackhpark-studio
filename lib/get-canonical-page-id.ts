import { type ExtendedRecordMap } from "notion-types";
import {
  getCanonicalPageId as getCanonicalPageIdImpl,
  parsePageId,
} from "notion-utils";

import { inversePageUrlOverrides } from "./config";

// The Notion API returns blocks with a double-nested value structure:
// block[id] = { spaceId, value: { value: { id, type, ... } } }
// notion-utils expects: block[id] = { value: { id, type, ... } }
// This function returns a recordMap view that notion-utils can read correctly.
function normalizeRecordMap(recordMap: ExtendedRecordMap): ExtendedRecordMap {
  const normalizedBlocks: ExtendedRecordMap["block"] = {};

  for (const [id, raw] of Object.entries(recordMap.block ?? {})) {
    const outer = (raw as any)?.value;
    const isDoubleNested =
      outer &&
      typeof outer === "object" &&
      "value" in outer &&
      outer.value &&
      typeof outer.value === "object" &&
      (outer.value.id || outer.value.type || outer.value.parent_id);

    normalizedBlocks[id] = isDoubleNested
      ? ({ value: outer.value } as any)
      : raw;
  }

  return { ...recordMap, block: normalizedBlocks };
}

export function getCanonicalPageId(
  pageId: string,
  recordMap: ExtendedRecordMap,
  { uuid = true }: { uuid?: boolean } = {},
): string | undefined {
  const cleanPageId = parsePageId(pageId, { uuid: false });
  if (!cleanPageId) {
    return;
  }

  const override = inversePageUrlOverrides[cleanPageId];
  if (override) {
    return override;
  } else {
    return (
      getCanonicalPageIdImpl(pageId, normalizeRecordMap(recordMap), {
        uuid,
      }) ?? undefined
    );
  }
}
