import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

void test("public site refresh UI submits one explicit public path", async () => {
  const [hook, panel, ingestionPage] = await Promise.all([
    readSource("hooks/usePublicSiteRefresh.ts"),
    readSource("components/admin/ingestion/PublicSiteRefreshPanel.tsx"),
    readSource("pages/admin/ingestion.tsx"),
  ]);

  assert.match(panel, /Public site refresh/);
  assert.match(panel, /\/studio/);
  assert.match(panel, /Refresh this page/);
  assert.match(
    panel,
    /disabled=\{isPathEmpty \|\| refresh\.isRefreshing\}/,
  );
  assert.match(hook, /fetch\("\/api\/admin\/revalidate-public-page"/);
  assert.match(hook, /method:\s*"POST"/);
  assert.match(hook, /JSON\.stringify\(\{ path \}\)/);
  assert.doesNotMatch(panel, /refresh all/i);

  assert.match(
    ingestionPage,
    /import \{ PublicSiteRefreshPanel \} from "@\/components\/admin\/ingestion\/PublicSiteRefreshPanel";/,
  );
  assert.match(
    ingestionPage,
    /<div className="mb-6 space-y-8">[\s\S]*?<PublicSiteRefreshPanel \/>\s*<ManualIngestionPanel \/>/,
  );
});
