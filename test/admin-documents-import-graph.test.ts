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

void test("admin/documents uses pure URL title helper without jsdom import chain", async () => {
  const [adminDocumentsPage, urlTitleModule, urlMetadataModule] = await Promise.all([
    readRepoFile("pages/admin/documents.tsx"),
    readRepoFile("lib/rag/url-title.ts"),
    readRepoFile("lib/rag/url-metadata.ts"),
  ]);

  assert.match(
    adminDocumentsPage,
    /from ["']@\/lib\/rag\/url-title["']/,
    "pages/admin/documents.tsx should import deriveTitleFromUrl from the pure url-title module",
  );
  assert.doesNotMatch(
    adminDocumentsPage,
    /from ["']@\/lib\/rag\/url-metadata["']/,
    "pages/admin/documents.tsx should not import url-metadata directly",
  );

  assert.doesNotMatch(
    urlTitleModule,
    /\bimport\b/,
    "lib/rag/url-title.ts should remain a pure helper module without imports",
  );
  assert.doesNotMatch(
    urlTitleModule,
    /\bjsdom\b|\bfetch-favicon\b/,
    "lib/rag/url-title.ts must not reference jsdom or fetch-favicon",
  );

  assert.doesNotMatch(
    urlMetadataModule,
    /^import\s+\{\s*fetchFaviconForUrl\s*\}/m,
    "lib/rag/url-metadata.ts must not statically import fetchFaviconForUrl",
  );
  assert.match(
    urlMetadataModule,
    /await import\(["']\.\/fetch-favicon["']\)/,
    "lib/rag/url-metadata.ts should lazy-load fetch-favicon",
  );
});
