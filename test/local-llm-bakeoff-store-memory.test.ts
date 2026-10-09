import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseVmStatUsedBytes } from "@/scripts/local-llm-bakeoff/host-memory.mjs";
import {
  openResultsStore,
  readJsonl,
} from "@/scripts/local-llm-bakeoff/results-store.mjs";

const row = { variant: "v1", pass: "baseline", itemId: "q1", rep: 1 };

void test("a reopened store remembers rows already written", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-store-"));
  try {
    const path = join(dir, "results.jsonl");
    const first = await openResultsStore(path);
    assert.equal(first.has(row), false);
    await first.append({ ...row, ok: true });
    const reopened = await openResultsStore(path);
    assert.equal(reopened.has(row), true);
    assert.equal(reopened.has({ ...row, rep: 2 }), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

void test("a partial last line from a crash is ignored and not glued to the next row", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-store-"));
  try {
    const path = join(dir, "results.jsonl");
    await appendFile(
      path,
      `${JSON.stringify({ ...row, ok: true })}\n{"variant":"v1","pa`,
    );
    const store = await openResultsStore(path);
    await store.append({ ...row, rep: 2, ok: true });
    const rows = await readJsonl(path);
    assert.deepEqual(
      rows.map((r) => r.rep),
      [1, 2],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

void test("vm_stat used memory is wired + active + compressor pages", () => {
  const text = [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free:                               100000.",
    "Pages active:                             200000.",
    "Pages inactive:                           150000.",
    "Pages wired down:                         300000.",
    "Pages stored in compressor:                80000.",
    "Pages occupied by compressor:              40000.",
  ].join("\n");
  assert.equal(parseVmStatUsedBytes(text), 540_000 * 16_384);
  assert.throws(() => parseVmStatUsedBytes("garbage"), /page size/);
});
