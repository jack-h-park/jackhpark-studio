import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const checklyRequire = createRequire(require.resolve("checkly"));
const configRequire = createRequire(
  require.resolve("@fisch0920/config/package.json"),
);
const vitestRequire = createRequire(
  configRequire.resolve("@vitest/eslint-plugin"),
);
const utilsRequire = createRequire(
  vitestRequire.resolve("@typescript-eslint/utils"),
);
const estreeRequire = createRequire(
  utilsRequire.resolve("@typescript-eslint/typescript-estree"),
);

type Matcher = { globParts: string[][] };
type MatchModule = {
  Minimatch: new (pattern: string, options: Record<string, unknown>) => Matcher;
  minimatch: (
    candidate: string,
    pattern: string,
    options?: Record<string, unknown>,
  ) => boolean;
};

for (const [consumer, consumerRequire] of [
  ["Checkly", checklyRequire],
  ["shared TypeScript ESLint", estreeRequire],
] as const) {
  const matcher = consumerRequire("minimatch") as MatchModule;

  void test(`${consumer} matching retains discovery and dot-file semantics`, () => {
    for (const [candidate, pattern, options, expected] of [
      ["__checks__/health.check.ts", "**/__checks__/**/*.check.ts", {}, true],
      ["nested/__checks__/ui.spec.ts", "**/__checks__/**/*.spec.ts", {}, true],
      [
        "__checks__/health.check.ts.bak",
        "**/__checks__/**/*.check.ts",
        {},
        false,
      ],
      [
        "nested/__checks__/ui.spec.ts",
        "**/__checks__/**/*.check.ts",
        {},
        false,
      ],
      [".config.ts", "*.ts", { dot: true }, true],
      [".config.ts", "*.ts", {}, false],
      ["fixtures/private.txt", "**/fixtures/**", { dot: true }, true],
      ["__checks__/health.check.ts", "**/fixtures/**", { dot: true }, false],
    ] as const) {
      assert.equal(matcher.minimatch(candidate, pattern, options), expected);
    }
  });

  void test(`${consumer} limits globstar-parent preprocessing to the configured expansion budget`, () => {
    // Six fragments previously generated 64 alternatives despite the limit.
    // Keep this input small: the test must not itself create a denial of service.
    const pattern = `root/${"**/../a/b/".repeat(6)}leaf`;
    const result = new matcher.Minimatch(pattern, {
      optimizationLevel: 2,
      braceExpandMax: 8,
    });
    assert.ok(
      result.globParts.length <= 8,
      "glob preprocessing exceeded its expansion budget",
    );
  });
}

void test("Checkly's real discovery helper preserves fixed patterns and ignored fixtures offline", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "glob-compat-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of [
    "__checks__/health.check.ts",
    "nested/__checks__/content.check.ts",
    "nested/__checks__/ui.spec.ts",
    "fixtures/__checks__/ignore.check.ts",
    ".hidden/__checks__/ignore.check.ts",
    "__checks__/health.check.ts.bak",
  ]) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "fixture");
  }
  const helperUrl = pathToFileURL(
    path.join(path.dirname(require.resolve("checkly")), "services/util.js"),
  ).href;
  const { findFilesWithPattern } = (await import(helperUrl)) as {
    findFilesWithPattern: (
      cwd: string,
      pattern: string | string[],
      ignore: string[],
    ) => Promise<string[]>;
  };
  const relative = (files: string[]) =>
    files.map((file) => path.relative(root, file).split(path.sep).join("/"));
  assert.deepEqual(
    relative(
      await findFilesWithPattern(root, "**/__checks__/**/*.check.ts", [
        "**/fixtures/**",
      ]),
    ),
    ["__checks__/health.check.ts", "nested/__checks__/content.check.ts"],
  );
  assert.deepEqual(
    relative(
      await findFilesWithPattern(root, "**/__checks__/**/*.spec.ts", []),
    ),
    ["nested/__checks__/ui.spec.ts"],
  );
});
