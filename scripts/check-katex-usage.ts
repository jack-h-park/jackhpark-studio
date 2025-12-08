import "dotenv/config";

import { getSiteMap } from "../lib/get-site-map";
import { notion } from "../lib/notion-api";
import { hasKaTeXContent } from "../lib/notion-katex";

type CanonicalPageMap = Record<string, string>;

function getFriendlyLabel(
  pageId: string,
  canonicalPageMap: CanonicalPageMap,
): string {
  for (const [canonicalId, rawId] of Object.entries(canonicalPageMap)) {
    if (rawId === pageId) {
      return canonicalId;
    }
  }

  return pageId;
}

console.log("🔍 Scanning Notion pages for KaTeX usage...");

try {
  const siteMap = await getSiteMap();
  const canonicalPageMap: CanonicalPageMap = siteMap.canonicalPageMap ?? {};

  const canonicalPageIds = Object.values(canonicalPageMap);
  const pageMap = siteMap.pageMap ?? {};

  const pageIds =
    canonicalPageIds.length > 0
      ? canonicalPageIds
      : (Object.keys(pageMap) as string[]);

  if (pageIds.length === 0) {
    console.log("⚠️ No pages found in site map. Nothing to scan.");
  } else {
    const pagesWithKaTeX: string[] = [];

    for (const pageId of pageIds) {
      try {
        const recordMap = await notion.getPage(pageId);

        if (hasKaTeXContent(recordMap)) {
          const label = getFriendlyLabel(pageId, canonicalPageMap);
          pagesWithKaTeX.push(label);
          console.log(`✅ KaTeX content found on page: ${label}`);
        }
      } catch (err) {
        console.error(`⚠️ Failed to scan page ${pageId}:`, err);
      }
    }

    if (pagesWithKaTeX.length === 0) {
      console.log("\n🚫 No KaTeX content detected in any Notion page.");
      console.log(
        "   → It should be safe to remove KaTeX CSS imports if you want.",
      );
    } else {
      console.log("\n✅ KaTeX IS in use. Keep KaTeX imports enabled.");
      console.log("Pages with KaTeX content:");
      for (const id of pagesWithKaTeX) {
        console.log(` - ${id}`);
      }
    }
  }
} catch (err) {
  console.error("❌ Error while scanning for KaTeX usage:", err);
  process.exitCode = 1;
}
