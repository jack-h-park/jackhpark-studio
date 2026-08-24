import { type Block, type ExtendedRecordMap } from "notion-types";
import { getBlockTitle } from "notion-utils";

import { normalizeNotionRecordMap } from "./rag/notion-record-value";

/**
 * Resolve a Notion page's own title from its record map.
 *
 * The render path deliberately keeps record entries doubly-nested
 * (`block[id].value.value`; see lib/rag/notion-record-value.ts), but
 * notion-utils' `getBlockTitle` reads `block.properties.title` directly. Passed
 * an un-normalized block it returns "" for every page, so callers silently fell
 * back to the site name — giving every page an identical `<title>`/`og:title`.
 *
 * Normalizing the record map first lets `getBlockTitle` read both plain-page
 * titles and inline-database (collection) item titles. Returns `undefined` when
 * the page genuinely has no title, so callers own the fallback chain and the
 * site name stays a last resort rather than the normal outcome.
 */
export function getPageTitle(
  recordMap: ExtendedRecordMap | undefined,
): string | undefined {
  if (!recordMap?.block) return undefined;

  const normalized = normalizeNotionRecordMap(recordMap);
  const blockId = Object.keys(normalized.block)[0];
  const block = blockId
    ? (normalized.block[blockId]?.value as Block | undefined)
    : undefined;
  if (!block) return undefined;

  const title = getBlockTitle(block, normalized)?.trim();
  return title || undefined;
}
