import { type ExtendedRecordMap } from "notion-types";
import {
  getCanonicalPageId as getCanonicalPageIdImpl,
  parsePageId,
} from "notion-utils";

import { inversePageUrlOverrides } from "./config";
import { normalizeNotionRecordMap } from "./rag/notion-record-value";

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
      getCanonicalPageIdImpl(pageId, normalizeNotionRecordMap(recordMap), {
        uuid,
      }) ?? undefined
    );
  }
}
