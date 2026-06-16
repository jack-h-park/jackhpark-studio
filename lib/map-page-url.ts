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
    const rawId = uuidToId(pageUuid);

    if (rawId === site.rootNotionPageId) {
      // The studio home lives at /studio; / is the landing page.
      return createUrl("/studio", searchParams);
    }

    if (!uuid) {
      // Only use a slug if the page is resolvable via canonicalPageMap.
      // Pages absent from canonicalPageMap (e.g. deep collection items not yet
      // traversed) fall back to raw UUID, which always resolves via parsePageId.
      const inverted = buildInvertedMap(canonicalPageMap);
      const slug = inverted[rawId];
      return createUrl(`/${slug ?? rawId}`, searchParams);
    }

    return createUrl(
      `/${getCanonicalPageId(pageUuid, recordMap, { uuid })}`,
      searchParams,
    );
  };

export const getCanonicalPageUrl =
  (site: Site, recordMap: ExtendedRecordMap) =>
  (pageId = "") => {
    const pageUuid = parsePageId(pageId, { uuid: true })!;

    if (uuidToId(pageId) === site.rootNotionPageId) {
      // The studio home lives at /studio; / is the landing page.
      return `https://${site.domain}/studio`;
    } else {
      return `https://${site.domain}/${getCanonicalPageId(pageUuid, recordMap, {
        uuid,
      })}`;
    }
  };

function createUrl(path: string, searchParams: URLSearchParams) {
  return [path, searchParams.toString()].filter(Boolean).join("?");
}
