import "dotenv/config";

import {
  findVisibilitySchemaProperties,
  getSiteMap,
} from "../lib/get-site-map";

// Live half of the sitemap visibility guard.
//
// The sitemap publishes every crawled page: no Notion collection schema
// expresses page visibility, so the old "Public" filter matched nothing and
// could never fail. This check makes that assumption falsifiable — it fails if
// Notion starts carrying a visibility column that the crawl would ignore, or if
// pages are silently dropped between the crawl and the canonical page map.
//
// Run against live Notion (or a warm .next/cache/notion-sitemap.json):
//   pnpm check:sitemap-visibility

console.log(
  "🔍 Checking the Notion sitemap for unhonoured visibility columns...",
);

const siteMap = await getSiteMap();
const pageMap = siteMap.pageMap ?? {};
const canonicalPageMap = siteMap.canonicalPageMap ?? {};

const crawledIds = Object.keys(pageMap);
const loadedIds = crawledIds.filter((pageId) => pageMap[pageId]);
const canonicalCount = Object.keys(canonicalPageMap).length;

console.log(
  `   crawled ${crawledIds.length} pages (${loadedIds.length} loaded) → ${canonicalCount} canonical slugs`,
);

const found = new Set<string>();
for (const pageId of loadedIds) {
  for (const name of findVisibilitySchemaProperties(pageMap[pageId]!)) {
    found.add(name);
  }
}

let failed = false;

if (found.size > 0) {
  failed = true;
  console.error(
    `\n❌ Notion defines visibility-looking column(s): ${[...found].toSorted().join(", ")}`,
  );
  console.error(
    "   The sitemap publishes every crawled page and ignores them. Either wire the",
  );
  console.error(
    "   column into buildCanonicalPageMap (lib/get-site-map.ts) or remove it in Notion.",
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
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("✅ Every loaded page has a canonical slug.");
}
