import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { load } from "js-yaml";

type Workflow = {
  on: string[] | Record<string, { branches?: string[] } | null>;
  jobs: {
    test: {
      name: string;
      strategy: { matrix: { "node-version": number[] } };
      steps: Array<{ run?: string }>;
    };
  };
};

const workflow = load(
  fs.readFileSync(".github/workflows/build.yml", "utf8"),
) as Workflow;

const require = createRequire(import.meta.url);
const semver = require("next/dist/compiled/semver") as {
  satisfies(version: string, range: string): boolean;
  maxSatisfying(versions: string[], range: string): string | null;
};

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  engines: { node: string };
};

function buildCount(event: "push" | "pull_request", branch: string): number {
  const trigger = workflow.on;
  const enabled = Array.isArray(trigger)
    ? trigger.includes(event)
    : event in trigger &&
      (!trigger[event]?.branches || trigger[event]!.branches!.includes(branch));
  return enabled
    ? workflow.jobs.test.strategy.matrix["node-version"].length
    : 0;
}

void test("one PR revision schedules four builds rather than duplicate push and PR builds", () => {
  assert.equal(
    buildCount("push", "codex/example") + buildCount("pull_request", "main"),
    4,
  );
});

void test("main updates retain all four required runtime build checks", () => {
  assert.equal(buildCount("push", "main"), 4);
  const versions = workflow.jobs.test.strategy.matrix["node-version"];
  assert.deepEqual(
    versions.map((version) =>
      workflow.jobs.test.name.replace(
        /\$\{\{\s*matrix\.node-version\s*\}\}/u,
        String(version),
      ),
    ),
    [
      "Test Node.js 20",
      "Test Node.js 22",
      "Test Node.js 24",
      "Test Node.js 26",
    ],
  );
  const commands = new Set(
    workflow.jobs.test.steps.flatMap((step) => (step.run ? [step.run] : [])),
  );
  for (const required of [
    "pnpm test:unit",
    "pnpm typecheck",
    "pnpm lint",
    "pnpm check:server-only-pages",
    "node scripts/ci/build-with-notion-fixture.mjs",
  ])
    assert.ok(commands.has(required), `retain verification gate ${required}`);
});

for (const version of [
  "20.0.0",
  "22.0.0",
  "24.0.0",
  "26.0.0",
  "26.13.0",
  "26.99.99",
]) {
  void test(`configured Node engine accepts ${version}`, () => {
    assert.equal(semver.satisfies(version, packageJson.engines.node), true);
  });
}

for (const version of ["19.9.9", "27.0.0", "28.0.0"]) {
  void test(`configured Node engine rejects ${version}`, () => {
    assert.equal(semver.satisfies(version, packageJson.engines.node), false);
  });
}

void test("configured Node engine selects Node 26 as the highest allowed candidate major", () => {
  assert.equal(
    semver.maxSatisfying(
      ["20.0.0", "22.0.0", "24.0.0", "26.0.0", "27.0.0", "28.0.0"],
      packageJson.engines.node,
    ),
    "26.0.0",
  );
});
