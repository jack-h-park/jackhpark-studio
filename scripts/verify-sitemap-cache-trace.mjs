import fs from "node:fs";
import path from "node:path";

const cachePath = path.join(process.cwd(), ".next/cache/notion-sitemap.json");
const tracePath = path.join(
  process.cwd(),
  ".next/server/pages/sitemap.xml.js.nft.json",
);
const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));

if (Object.keys(cache.data?.canonicalPageMap ?? {}).length === 0) {
  throw new Error("sitemap cache has no published pages after build");
}

if (
  !trace.files.some(
    (file) => path.resolve(path.dirname(tracePath), file) === cachePath,
  )
) {
  throw new Error("sitemap cache is absent from the function trace");
}
