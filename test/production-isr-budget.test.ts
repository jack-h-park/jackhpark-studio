import assert from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

void describe("production ISR budget", () => {
  void it("keeps public Notion pages and their cache on a five-minute cadence", async () => {
    const [siteConfig, studioPage, notionPage] = await Promise.all([
      readFile(path.join(repoRoot, "site.config.ts"), "utf8"),
      readFile(path.join(repoRoot, "pages", "studio.tsx"), "utf8"),
      readFile(path.join(repoRoot, "pages", "[pageId].tsx"), "utf8"),
    ]);

    assert.match(siteConfig, /notionPageCacheTTLSeconds:\s*300/);
    assert.match(studioPage, /revalidate:\s*300/);
    assert.match(notionPage, /revalidate:\s*300/);
  });
});
