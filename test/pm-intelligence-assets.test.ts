import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { validateAssets } from "../scripts/check-pm-intelligence-assets.mjs";

void test("asset validation rejects unreviewed, escaping and corrupted published assets", async () => {
  const root = await mkdtemp(
    path.join(
      process.env.PM_WORLD_ARTIFACT_ROOT || tmpdir(),
      "pm-world-assets-",
    ),
  );
  try {
    await mkdir(path.join(root, "experiences/pm-intelligence"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "experiences/pm-intelligence/test.webp"),
      "hello",
    );
    const entry = {
      id: "test",
      url: "/experiences/pm-intelligence/test.webp",
      sha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      bytes: 5,
      kind: "image",
      reviewStatus: "accepted",
    };
    assert.equal(
      (await validateAssets({ version: 1, assets: [entry] }, root)).bytes,
      5,
    );
    for (const patch of [
      { url: "/experiences/pm-intelligence/../../secret.webp" },
      { sha256: "bad" },
      { bytes: 2 },
      { reviewStatus: "draft" },
    ])
      await assert.rejects(() =>
        validateAssets({ version: 1, assets: [{ ...entry, ...patch }] }, root),
      );
    await assert.rejects(() =>
      validateAssets({ version: 1, assets: [entry, entry] }, root),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
