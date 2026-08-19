import "dotenv/config";

import {
  findUnhonouredVisibilityProperties,
  getSiteMap,
} from "../lib/get-site-map";

// Live half of the sitemap visibility guard.
//
// The website publishes every crawled page. It used to filter on a Notion
// property called "Public" that no collection defines — a leftover from a
// personal-vs-public split that `_persona_type` replaced — so the filter never
// excluded anything and nothing noticed for as long as it existed.
//
// This makes the assumption falsifiable in both directions: it fails if Notion
// grows a visibility column the website would ignore, or if pages go missing
// between the crawl and the canonical page map.
//
// Run against live Notion (or a warm .next/cache/notion-sitemap.json):
//   pnpm check:sitemap-visibility

console.log("🔍 Checking the Notion sitemap's visibility handling...");

const siteMap = await getSiteMap();
const pageMap = siteMap.pageMap ?? {};
const canonicalPageMap = siteMap.canonicalPageMap ?? {};

const loadedIds = Object.keys(pageMap).filter((pageId) => pageMap[pageId]);
const canonicalCount = Object.keys(canonicalPageMap).length;

console.log(
  `   ${loadedIds.length} pages loaded → ${canonicalCount} canonical slugs`,
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
    `\n❌ Notion defines visibility-looking column(s) the website ignores: ${[...unhonoured].toSorted().join(", ")}`,
  );
  console.error(
    "   The sitemap publishes every crawled page. Either wire the column into",
  );
  console.error(
    "   getAllPagesImpl (lib/get-site-map.ts) or remove it in Notion.",
  );
  console.error(
    "   Note: ingestion reads `_is_public` for chat retrieval — that is separate.",
  );
} else {
  console.log(
    "\n✅ No visibility column in any collection schema — publishing every page is correct.",
  );
}

if (canonicalCount !== loadedIds.length) {
  failed = true;
  console.error(
    `\n❌ ${loadedIds.length - canonicalCount} loaded page(s) are missing from the canonical page map.`,
  );
  console.error(
    "   Pages absent from the map lose their slug, sitemap.xml and feed entries.",
  );
} else {
  console.log("✅ Every loaded page has a canonical slug.");
}

if (failed) {
  process.exitCode = 1;
}
