import assert from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

void describe("production ISR budget", () => {
  void it("keeps public Notion pages and their cache on a one-hour cadence", async () => {
    const [siteConfig, studioPage, notionPage, revalidationRoute] =
      await Promise.all([
        readFile(path.join(repoRoot, "site.config.ts"), "utf8"),
        readFile(path.join(repoRoot, "pages", "studio.tsx"), "utf8"),
        readFile(path.join(repoRoot, "pages", "[pageId].tsx"), "utf8"),
        readFile(
          path.join(
            repoRoot,
            "pages",
            "api",
            "admin",
            "revalidate-public-page.ts",
          ),
          "utf8",
        ),
      ]);

    assert.match(siteConfig, /notionPageCacheTTLSeconds:\s*3600/);
    assert.match(studioPage, /return \{ props, revalidate: 3600 \}/);
    assert.match(notionPage, /revalidate:\s*3600/);
    assert.match(studioPage, /notFound: true,\s*revalidate: 10/);
    assert.match(revalidationRoute, /requireAdminApiAccess/);
    assert.match(revalidationRoute, /requireSameOriginMutation/);
    assert.match(revalidationRoute, /auditAdminMutation/);
    assert.match(revalidationRoute, /await res\.revalidate\(target\.path\)/);
    assert.match(
      revalidationRoute,
      /try \{\s+const siteMap = await getSiteMap\(\);\s+target = resolvePublicPageRevalidationTarget\(/,
    );
    assert.match(
      revalidationRoute,
      /target: target\?\.path \?\? "public-page"/,
    );
  });
});
