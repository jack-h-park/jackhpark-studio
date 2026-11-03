import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { load } from "js-yaml";

const require = createRequire(import.meta.url);

void test("the installed graph does not expose unused deepmerge through Stagehand", () => {
  // This removal covers the unused Stagehand 1.14 peer, not a patched merge primitive.
  const installed = load(
    readFileSync(
      new URL("../node_modules/.pnpm/lock.yaml", import.meta.url),
      "utf8",
    ),
  ) as {
    packages: Record<string, unknown>;
    snapshots: Record<string, unknown>;
  };
  assert.deepEqual(
    Object.keys(installed.packages).filter((name) =>
      name.startsWith("deepmerge@"),
    ),
    [],
  );
  assert.deepEqual(
    Object.keys(installed.snapshots).filter((name) =>
      name.startsWith("deepmerge@"),
    ),
    [],
  );
  const communityRequire = createRequire(
    require.resolve("@langchain/community/vectorstores/supabase"),
  );
  const stagehandRequire = createRequire(
    communityRequire.resolve("@browserbasehq/stagehand"),
  );
  assert.throws(() => stagehandRequire.resolve("deepmerge"), {
    code: "MODULE_NOT_FOUND",
  });
});
