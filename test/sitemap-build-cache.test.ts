import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve("scripts/ensure-sitemap-cache-trace.mjs");
const verifyScriptPath = path.resolve("scripts/verify-sitemap-cache-trace.mjs");

void test("prebuild creates an expired sitemap cache file for tracing", (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-trace-"));
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: workDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const cachePath = path.join(workDir, ".next/cache/notion-sitemap.json");
  const entry = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
    ts: number;
    buildId: string | null;
    data: Record<string, unknown>;
  };
  assert.deepEqual(entry, { ts: 0, buildId: null, data: {} });
});

void test("prebuild preserves an existing sitemap cache file", (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-trace-"));
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

  const cachePath = path.join(workDir, ".next/cache/notion-sitemap.json");
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const existing = '{"ts":123,"buildId":"old","data":{"pages":1}}';
  fs.writeFileSync(cachePath, existing);

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: workDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(cachePath, "utf8"), existing);
});

void test("postbuild fails when the sitemap cache is absent from the function trace", (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-trace-"));
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

  const cachePath = path.join(workDir, ".next/cache/notion-sitemap.json");
  const tracePath = path.join(
    workDir,
    ".next/server/pages/sitemap.xml.js.nft.json",
  );
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    JSON.stringify({ data: { canonicalPageMap: { studio: "id" } } }),
  );
  fs.writeFileSync(tracePath, JSON.stringify({ files: ["./other-file"] }));

  const result = spawnSync(process.execPath, [verifyScriptPath], {
    cwd: workDir,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sitemap cache.*trace/i);
});

void test("postbuild accepts a populated sitemap cache included in the function trace", (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-trace-"));
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

  const cachePath = path.join(workDir, ".next/cache/notion-sitemap.json");
  const tracePath = path.join(
    workDir,
    ".next/server/pages/sitemap.xml.js.nft.json",
  );
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    JSON.stringify({ data: { canonicalPageMap: { studio: "id" } } }),
  );
  fs.writeFileSync(
    tracePath,
    JSON.stringify({ files: ["../../cache/notion-sitemap.json"] }),
  );

  const result = spawnSync(process.execPath, [verifyScriptPath], {
    cwd: workDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
});
