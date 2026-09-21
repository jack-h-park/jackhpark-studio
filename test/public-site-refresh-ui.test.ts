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
  assert.match(hook, /fetch\("\/api\/admin\/revalidate-public-page"/);
  assert.match(hook, /method:\s*"POST"/);
  assert.match(hook, /JSON\.stringify\(\{ path \}\)/);
  assert.doesNotMatch(panel, /refresh all/i);

  assert.match(
    ingestionPage,
    /import \{ PublicSiteRefreshPanel \} from "@\/components\/admin\/ingestion\/PublicSiteRefreshPanel";/,
  );
  const refreshPanelIndex = ingestionPage.indexOf("<PublicSiteRefreshPanel />");
  const manualPanelIndex = ingestionPage.indexOf("<ManualIngestionPanel />");
  assert.ok(refreshPanelIndex !== -1);
  assert.ok(manualPanelIndex !== -1);
  assert.ok(refreshPanelIndex < manualPanelIndex);
});
