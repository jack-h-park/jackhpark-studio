import { type ExtendedRecordMap } from "notion-types";
import { parsePageId, uuidToId } from "notion-utils";

import { includeNotionIdInUrls } from "./config";
import { getCanonicalPageId } from "./get-canonical-page-id";
import { type Site } from "./types";

// include UUIDs in page URLs during local development but not in production
// (they're nice for debugging and speed up local dev)
const uuid = !!includeNotionIdInUrls;

// canonicalPageMap is {slug: notionId}; invert once per call site to look up
// slug by notionId when the block is absent from the current page's recordMap.
function buildInvertedMap(
  canonicalPageMap?: Record<string, string>,
): Record<string, string> {
  if (!canonicalPageMap) return {};
  return Object.fromEntries(
    Object.entries(canonicalPageMap).map(([slug, notionId]) => [
      uuidToId(notionId),
      slug,
    ]),
  );
}

export const mapPageUrl =
  (
    site: Site,
    recordMap: ExtendedRecordMap,
    searchParams: URLSearchParams,
    canonicalPageMap?: Record<string, string>,
  ) =>
  (pageId = "") => {
    const pageUuid = parsePageId(pageId, { uuid: true })!;

    if (uuidToId(pageUuid) === site.rootNotionPageId) {
      return createUrl("/", searchParams);
    }

    let canonical = getCanonicalPageId(pageUuid, recordMap, { uuid });

    // If getCanonicalPageId fell back to a raw 32-char hex ID (no block data in
    // the current recordMap), resolve via the site-wide canonicalPageMap instead.
    if (canonical && !uuid && /^[0-9a-f]{32}$/i.test(canonical)) {
      const inverted = buildInvertedMap(canonicalPageMap);
      canonical = inverted[canonical] ?? canonical;
    }

    return createUrl(`/${canonical}`, searchParams);
  };

export const getCanonicalPageUrl =
  (site: Site, recordMap: ExtendedRecordMap) =>
  (pageId = "") => {
    const pageUuid = parsePageId(pageId, { uuid: true })!;

    if (uuidToId(pageId) === site.rootNotionPageId) {
      return `https://${site.domain}`;
    } else {
      return `https://${site.domain}/${getCanonicalPageId(pageUuid, recordMap, {
        uuid,
      })}`;
    }
  };

function createUrl(path: string, searchParams: URLSearchParams) {
  return [path, searchParams.toString()].filter(Boolean).join("?");
}
