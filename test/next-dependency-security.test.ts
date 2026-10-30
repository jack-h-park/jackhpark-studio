import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));

void test("installs the patched Next release for image and Server Actions advisories", () => {
  const nextPackage = require("next/package.json") as { version: string };

  assert.equal(nextPackage.version, "15.5.28");
});

void test("Next resolves the retained Sharp image mitigation", () => {
  const sharp = nextRequire("sharp") as { versions: { sharp: string } };

  assert.equal(sharp.versions.sharp, "0.35.5");
});
