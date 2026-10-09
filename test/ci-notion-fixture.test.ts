import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import test from "node:test";

import { load } from "js-yaml";

const wrapperPath = resolvePath("scripts/ci/build-with-notion-fixture.mjs");

function run(env: Record<string, string>, code: string, cwd = process.cwd()) {
  return new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [wrapperPath, process.execPath, "--input-type=module", "-e", code],
        {
          cwd,
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.on("error", reject);
      child.on("exit", (code) => resolve({ code, output }));
    },
  );
}

void test("CI wrapper routes the real Notion client exclusively to a local fixture", async () => {
  const result = await run(
    { CI: "true", VERCEL: "" },
    `
    import {NotionAPI} from 'notion-client';
    const base=process.env.NOTION_API_BASE_URL;
    if(!base.startsWith('http://127.0.0.1:'))process.exit(8);
    const map=await new NotionAPI({apiBaseUrl:base}).getPage('28299029-c0b4-81ce-8999-d425287d3db6');
    console.log(map.block['28299029-c0b4-81ce-8999-d425287d3db6'].value.properties.title[0][0]);
  `,
  );
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /CI fixture page/);
});

void test("CI fixture wrapper cannot run in Vercel or outside CI", async () => {
  for (const env of [
    { CI: "true", VERCEL: "1" },
    { CI: "", VERCEL: "" },
  ]) {
    const result = await run(env, "console.log('CHILD_RAN')");
    assert.notEqual(result.code, 0);
    assert.doesNotMatch(result.output, /CHILD_RAN/);
  }
});

void test("unexpected Notion operations fail instead of falling through to live Notion", async () => {
  const result = await run(
    { CI: "true", VERCEL: "" },
    `
    const response=await fetch(process.env.NOTION_API_BASE_URL+'/unexpected',{method:'POST',body:'{}'});
    console.log(response.status);
  `,
  );
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /501/);
});

void test("fixture wrapper preserves build failure status", async () => {
  const result = await run({ CI: "true", VERCEL: "" }, "process.exit(7)");
  assert.equal(result.code, 7, result.output);
});

void test("fixture builds isolate and expire their sitemap cache without changing foreign entries", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "studio-ci-fixture-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const ownCache of [true, false]) {
    const result = await run(
      { CI: "true", VERCEL: "", VERCEL_DEPLOYMENT_ID: "existing-build" },
      `
      import {mkdirSync,writeFileSync} from 'node:fs';
      const id=process.env.VERCEL_DEPLOYMENT_ID;
      if(!id.startsWith('ci-fixture-'))process.exit(8);
      mkdirSync('.next/cache',{recursive:true});
      writeFileSync('.next/cache/notion-sitemap.json',JSON.stringify({buildId:${ownCache ? "id" : "'foreign-build'"},ts:123,data:{fixture:true}}));
      `,
      cwd,
    );
    assert.equal(result.code, 0, result.output);
    const cache = JSON.parse(
      readFileSync(join(cwd, ".next/cache/notion-sitemap.json"), "utf8"),
    ) as { ts: number; data: { fixture: boolean } };
    assert.equal(cache.ts, ownCache ? 0 : 123);
    assert.deepEqual(cache.data, { fixture: true });
  }
});

void test("ordinary CI builds use fixtures and live Notion validation requires manual dispatch", () => {
  const ordinary = load(
    readFileSync(".github/workflows/build.yml", "utf8"),
  ) as { jobs: { test: { steps: Array<{ name?: string; run?: string }> } } };
  const command = ordinary.jobs.test.steps.find(
    (step) => step.name === "Build",
  )?.run;
  assert.equal(command, "node scripts/ci/build-with-notion-fixture.mjs");
  const live = load(
    readFileSync(".github/workflows/notion-live-validation.yml", "utf8"),
  ) as {
    on: Record<string, unknown>;
    jobs: { build: { steps: Array<{ run?: string }> } };
  };
  assert.deepEqual(Object.keys(live.on), ["workflow_dispatch"]);
  assert.ok(live.jobs.build.steps.some((step) => step.run === "pnpm build"));
});
