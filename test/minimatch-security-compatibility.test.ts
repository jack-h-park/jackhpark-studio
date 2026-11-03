import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const configRequire = createRequire(
  require.resolve("@fisch0920/config/eslint"),
);
const tsEslintRequire = createRequire(
  configRequire.resolve("typescript-eslint"),
);
const estreeRequire = createRequire(
  tsEslintRequire.resolve("@typescript-eslint/typescript-estree"),
);
const checklyRequire = createRequire(require.resolve("checkly"));
const globRequire = createRequire(checklyRequire.resolve("glob"));
const eslintRequire = createRequire(require.resolve("eslint"));

interface Matcher {
  globParts: string[][];
  set: unknown[][];
  match(path: string): boolean;
  makeRe(): RegExp | false;
  secondPhasePreProcess(rows: string[][]): string[][];
  partsMatch(
    a: string[],
    b: string[],
    emptyGlobstarMatch?: boolean,
  ): string[] | false;
}

interface MatcherModule {
  Minimatch: new (
    pattern: string,
    options: { optimizationLevel: number; braceExpandMax?: number },
  ) => Matcher;
}

for (const [version, consumerRequire] of [
  ["10.2.4", estreeRequire],
  ["10.2.6", globRequire],
] as const) {
  const entry = consumerRequire.resolve("minimatch");
  const packageRoot = dirname(dirname(dirname(entry)));
  const metadata = consumerRequire("minimatch/package.json") as {
    version: string;
  };
  assert.equal(metadata.version, version);

  for (const format of ["commonjs", "esm"] as const) {
    // Import the published ESM entry, not an interop wrapper around require().
    const module = (
      format === "commonjs"
        ? consumerRequire("minimatch")
        : await import(
            pathToFileURL(join(packageRoot, "dist/esm/index.js")).href
          )
    ) as MatcherModule;
    const label = `minimatch ${version} ${format}`;

    void test(
      `${label} caps level-2 globstar-parent alternatives`,
      { timeout: 5000 },
      () => {
        const matcher = new module.Minimatch(
          Array.from({ length: 8 }, () => "**/../a/b").join("/"),
          {
            optimizationLevel: 2,
            braceExpandMax: 16,
          },
        );
        assert.ok(
          matcher.globParts.length <= 16,
          `received ${matcher.globParts.length} alternatives`,
        );
      },
    );

    void test(`${label} preserves below-limit globstar-parent matches`, () => {
      const matcher = new module.Minimatch("**/../a/b/**/../c/d", {
        optimizationLevel: 2,
        braceExpandMax: 16,
      });
      assert.equal(matcher.match("../a/b/../c/d"), true);
      assert.equal(matcher.match("x/a/b/y/c/d"), true);
      assert.equal(matcher.match("wrong"), false);
    });

    void test(
      `${label} skips pairwise comparisons above 1000 rows without losing matches`,
      { timeout: 5000 },
      () => {
        const rows = Array.from({ length: 1001 }, (_, index) => [
          `row${index}`,
        ]);
        const matcher = new module.Minimatch("seed", { optimizationLevel: 2 });
        const originalPartsMatch = matcher.partsMatch;
        let comparisons = 0;
        matcher.partsMatch = function (a, b, emptyGlobstarMatch) {
          comparisons++;
          return originalPartsMatch.call(this, a, b, emptyGlobstarMatch);
        };
        const processed = matcher.secondPhasePreProcess(rows);
        assert.deepEqual(processed, rows);
        assert.equal(comparisons, 0);

        const expanded = new module.Minimatch(`{${rows.flat().join(",")}}`, {
          optimizationLevel: 2,
        });
        assert.equal(expanded.globParts.length, 1001);
        assert.equal(expanded.match("row0"), true);
        assert.equal(expanded.match("row1000"), true);
        assert.equal(expanded.match("row1001"), false);
      },
    );

    void test(`${label} retains RegExp set and makeRe contracts`, () => {
      const matcher = new module.Minimatch("src/*.ts", {
        optimizationLevel: 2,
      });
      // Glob 13 branches on RegExp identity in Minimatch.set.
      assert.ok(matcher.set[0]?.some((part) => part instanceof RegExp));
      const expression = matcher.makeRe();
      assert.ok(expression instanceof RegExp);
      assert.equal(expression.test("src/example.ts"), true);
      assert.equal(expression.test("src/example.js"), false);
    });
  }
}

void test("ESLint retains minimatch 3.1.5's callable API", () => {
  const metadata = eslintRequire("minimatch/package.json") as {
    version: string;
  };
  assert.equal(metadata.version, "3.1.5");
  const minimatch = eslintRequire("minimatch") as (
    path: string,
    pattern: string,
  ) => boolean;
  assert.equal(typeof minimatch, "function");
  assert.equal(minimatch("src/example.ts", "src/*.ts"), true);
  assert.equal(minimatch("src/example.js", "src/*.ts"), false);
});

void test("Checkly's real glob 13 preserves globstar, ignore and dot behavior", async (t) => {
  const metadata = checklyRequire("glob/package.json") as { version: string };
  assert.equal(metadata.version, "13.0.6");
  const glob = checklyRequire("glob") as {
    globSync(
      pattern: string,
      options: { cwd: string; ignore?: string; dot?: boolean },
    ): string[];
  };
  const root = await mkdtemp(join(tmpdir(), "studio-minimatch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [
    "root.ts",
    "root.js",
    "src/nested/deep.ts",
    "src/nested/deep.js",
    ".hidden.ts",
    "ignored/skip.ts",
  ];
  for (const file of files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), "fixture\n");
  }
  assert.deepEqual(glob.globSync("**/*.ts", { cwd: root }).toSorted(), [
    "ignored/skip.ts",
    "root.ts",
    "src/nested/deep.ts",
  ]);
  assert.deepEqual(
    glob
      .globSync("**/*.ts", { cwd: root, ignore: "ignored/**", dot: false })
      .toSorted(),
    ["root.ts", "src/nested/deep.ts"],
  );
  assert.deepEqual(
    glob
      .globSync("**/*.ts", { cwd: root, ignore: "ignored/**", dot: true })
      .toSorted(),
    [".hidden.ts", "root.ts", "src/nested/deep.ts"],
  );
});
