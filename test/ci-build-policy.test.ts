import assert from "node:assert/strict";
import fs from "node:fs";
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

void test("one PR revision schedules two builds rather than duplicate push and PR builds", () => {
  assert.equal(
    buildCount("push", "codex/example") + buildCount("pull_request", "main"),
    2,
  );
});

void test("main updates retain both required runtime build checks", () => {
  assert.equal(buildCount("push", "main"), 2);
  const versions = workflow.jobs.test.strategy.matrix["node-version"];
  assert.deepEqual(
    versions.map((version) =>
      workflow.jobs.test.name.replace(
        /\$\{\{\s*matrix\.node-version\s*\}\}/u,
        String(version),
      ),
    ),
    ["Test Node.js 20", "Test Node.js 22"],
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
