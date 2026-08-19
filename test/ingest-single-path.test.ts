import assert from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

/**
 * The same file with comments removed.
 *
 * These assertions name the symbols the CLI must not use, and the CLI's header explains why
 * it no longer uses them — so asserting against raw text made the test fail on its own
 * documentation. Checking code only means recording a defect cannot trip the guard against
 * it. Block comments go first; line comments are dropped only when they own the line, so a
 * `//` inside a string (a URL, say) is never touched.
 */
async function readRepoCode(relativePath: string): Promise<string> {
  const source = await readRepoFile(relativePath);
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*");
    })
    .join("\n");
}

// Both defects this pins were structural — a second copy of the traversal, and a second
// Notion client — so the assertions are structural too. Neither could be caught by
// exercising the CLI: the broken crawl returned a plausible-looking result (one page,
// no error), and the wrong client failed only against the live endpoint.
void test("the Notion ingest CLI delegates instead of carrying its own traversal", async () => {
  const cli = await readRepoCode("scripts/ingest-notion.ts");

  assert.match(
    cli,
    /from ["']\.\.\/lib\/admin\/manual-ingestor["']/,
    "scripts/ingest-notion.ts must run ingestion through the shared manual-ingestion path",
  );

  assert.doesNotMatch(
    cli,
    /getAllPagesInSpace/,
    "scripts/ingest-notion.ts must not traverse Notion itself — that crawl belongs to the " +
      "shared path. A bare getAllPagesInSpace here matched zero page-like blocks against the " +
      "live record-map shape and silently ingested only the root page.",
  );

  assert.doesNotMatch(
    cli,
    /new\s+NotionAPI\s*\(/,
    "scripts/ingest-notion.ts must not construct its own Notion client — one built here " +
      "ignored NOTION_API_BASE_URL and hit an endpoint that answers 403 without a token.",
  );

  for (const duplicated of [
    "prepareNotionPageDocument",
    "ingestPreparedDocument",
    "sweepUnvisitedDocuments",
    "startIngestRun",
    "withIngestRun",
  ]) {
    assert.doesNotMatch(
      cli,
      new RegExp(`\\b${duplicated}\\b`),
      `scripts/ingest-notion.ts must not call ${duplicated} directly; the shared path owns it`,
    );
  }
});

void test("the shared ingestion path reads Notion through the configured client", async () => {
  const ingestor = await readRepoCode("lib/admin/manual-ingestor.ts");

  assert.match(
    ingestor,
    /import\s+\{\s*notion\s*\}\s+from\s+["']\.\.\/notion-api["']/,
    "lib/admin/manual-ingestor.ts must use the shared client, which honours NOTION_API_BASE_URL",
  );
  assert.doesNotMatch(
    ingestor,
    /new\s+NotionAPI\s*\(/,
    "lib/admin/manual-ingestor.ts must not construct its own Notion client",
  );
});

void test("run source is caller-supplied so delegated runs stay distinguishable", async () => {
  const ingestor = await readRepoCode("lib/admin/manual-ingestor.ts");
  const cli = await readRepoCode("scripts/ingest-notion.ts");

  // The admin runs list builds its source filter from the distinct values recorded, so the
  // CLI sharing the dashboard's code path must not also share its label.
  assert.match(
    ingestor,
    /source\s*=\s*["']manual\/notion-page["']/,
    "the shared path must keep defaulting to the value admin-initiated runs already use",
  );
  assert.match(
    cli,
    /source:\s*["']cli\/notion-page["']/,
    "the CLI must label its runs distinctly from dashboard-initiated ones",
  );
});
