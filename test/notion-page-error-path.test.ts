import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readRepoFile(relative: string): Promise<string> {
  return readFile(path.join(repoRoot, relative), "utf8");
}

// A build that prerenders every page trips Notion's rate limiter. When the page
// renderer answered a 429 with `notFound: true`, that 404 was written into the
// prerender cache and stayed there until the next deploy happened to succeed —
// one such build took 48 live pages off jackhpark.com while the site looked
// perfectly healthy. A fetch failure must never be published as a 404.
void describe("page render error path", () => {
  void it("rethrows fetch failures instead of publishing a 404", async () => {
    const source = await readRepoFile("pages/[pageId].tsx");

    const catchBlock = source.slice(source.indexOf("} catch (err) {"));
    assert.ok(catchBlock.length > 0, "getStaticProps must keep a catch block");

    assert.doesNotMatch(
      catchBlock,
      /notFound:\s*true/,
      "a thrown fetch error must not be turned into a cached 404",
    );
    assert.match(
      catchBlock,
      /throw err;/,
      "the error must propagate so nothing is cached for a failed fetch",
    );
  });

  void it("routes page fetches through the shared rate-limit retry", async () => {
    const source = await readRepoFile("lib/notion.ts");

    assert.match(
      source,
      /import \{ withRateLimitRetry \} from "\.\/notion-rate-limit"/,
      "lib/notion.ts must use the shared retry helper",
    );
    assert.doesNotMatch(
      source,
      /(async )?function withRateLimitRetry/,
      "lib/notion.ts must not define its own retry — the two would drift on attempt counts",
    );
  });
});
