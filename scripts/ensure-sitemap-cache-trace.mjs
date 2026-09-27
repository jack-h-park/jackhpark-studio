import fs from "node:fs";
import path from "node:path";

// Next traces server files before getStaticProps writes the real sitemap.
// A stale placeholder makes the cache path traceable without skipping the crawl.
const cachePath = path.join(process.cwd(), ".next/cache/notion-sitemap.json");
fs.mkdirSync(path.dirname(cachePath), { recursive: true });

try {
  fs.writeFileSync(
    cachePath,
    JSON.stringify({ ts: 0, buildId: null, data: {} }),
    { flag: "wx" },
  );
} catch (error) {
  if (error?.code !== "EEXIST") throw error;
}
