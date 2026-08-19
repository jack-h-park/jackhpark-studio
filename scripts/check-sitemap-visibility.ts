import "dotenv/config";

import {
  findUnhonouredVisibilityProperties,
  getSiteMap,
} from "../lib/get-site-map";
import {
  getNotionPageIsPublic,
  NOTION_IS_PUBLIC_PROPERTY,
} from "../lib/rag/notion-metadata";
import { normalizeNotionRecordMap } from "../lib/rag/notion-record-value";

// Live half of the sitemap visibility guard (ported from #77).
//
// The crawl honours exactly one Notion column, `_is_public`. Two things can go
// wrong silently, and both cost content: Notion grows a visibility column
// under a different name that the crawl ignores (the bug this replaced — the
// site looked for "Public", which no schema defines), or pages vanish from the
// canonical map for a reason other than that checkbox.
//
// Run against live Notion (or a warm .next/cache/notion-sitemap.json):
//   pnpm check:sitemap-visibility

console.log("🔍 Checking the Notion sitemap's visibility handling...");

const siteMap = await getSiteMap();
const pageMap = siteMap.pageMap ?? {};
const canonicalPageMap = siteMap.canonicalPageMap ?? {};

const loadedIds = Object.keys(pageMap).filter((pageId) => pageMap[pageId]);
const canonicalCount = Object.keys(canonicalPageMap).length;

const excluded = loadedIds.filter(
  (pageId) =>
    getNotionPageIsPublic(
      normalizeNotionRecordMap(pageMap[pageId]!),
      pageId,
    ) === false,
);

console.log(
  `   ${loadedIds.length} pages loaded, ${excluded.length} marked non-public → ${canonicalCount} canonical slugs`,
);

const unhonoured = new Set<string>();
for (const pageId of loadedIds) {
  for (const name of findUnhonouredVisibilityProperties(pageMap[pageId]!)) {
    unhonoured.add(name);
  }
}

let failed = false;

if (unhonoured.size > 0) {
  failed = true;
  console.error(
    `\n❌ Notion defines visibility-looking column(s) the crawl ignores: ${[...unhonoured].toSorted().join(", ")}`,
  );
  console.error(
    `   Only "${NOTION_IS_PUBLIC_PROPERTY}" is honoured. Rename the column in Notion,`,
  );
  console.error("   or wire it into lib/rag/notion-metadata.ts.");
} else {
  console.log(
    `\n✅ "${NOTION_IS_PUBLIC_PROPERTY}" is the only visibility column in any schema.`,
  );
}

const expected = loadedIds.length - excluded.length;
if (canonicalCount !== expected) {
  failed = true;
  console.error(
    `\n❌ expected ${expected} canonical slugs (${loadedIds.length} loaded − ${excluded.length} non-public), got ${canonicalCount}.`,
  );
  console.error(
    "   Pages absent from the map lose their slug, sitemap.xml and feed entries.",
  );
} else {
  console.log("✅ Every publishable page has a canonical slug.");
}

if (failed) {
  process.exitCode = 1;
}
