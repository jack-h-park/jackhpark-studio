import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { clearMemoryCache, memoryCacheClient } from "@/lib/server/chat-cache";

beforeEach(() => clearMemoryCache());

void test("entry pressure evicts the least recently read entry", async () => {
  for (let i = 0; i < 256; i++) {
    await memoryCacheClient.set(`entry:${i}`, i, 60);
  }
  assert.equal(await memoryCacheClient.get("entry:0"), 0);
  await memoryCacheClient.set("new", "new", 60);
  assert.equal(await memoryCacheClient.get("entry:1"), null);
  assert.equal(await memoryCacheClient.get("entry:0"), 0);
  assert.equal(await memoryCacheClient.get("entry:255"), 255);
});

void test("serialized payload pressure evicts entries before the count limit", async () => {
  const payload = "a".repeat(1024 * 1024 - 2);
  for (let i = 0; i < 8; i++) {
    await memoryCacheClient.set(`large:${i}`, payload, 60);
  }
  assert.equal(await memoryCacheClient.get("large:0"), payload);
  await memoryCacheClient.set("extra", "x", 60);
  assert.equal(await memoryCacheClient.get("large:1"), null);
  assert.equal(await memoryCacheClient.get("large:0"), payload);
  assert.equal(await memoryCacheClient.get("extra"), "x");
});

void test("the entry size limit counts UTF-8 bytes and JSON framing", async () => {
  await memoryCacheClient.set("boundary", "a".repeat(1024 * 1024 - 2), 60);
  assert.ok(await memoryCacheClient.get("boundary"));
  await memoryCacheClient.set("over", "a".repeat(1024 * 1024 - 1), 60);
  await memoryCacheClient.set("unicode", "한".repeat(400_000), 60);
  assert.equal(await memoryCacheClient.get("over"), null);
  assert.equal(await memoryCacheClient.get("unicode"), null);
});

void test("hits do not extend the absolute deadline and equality is expired", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  await memoryCacheClient.set("ttl", "value", 10);
  t.mock.timers.tick(9000);
  assert.equal(await memoryCacheClient.get("ttl"), "value");
  t.mock.timers.tick(1000);
  assert.equal(await memoryCacheClient.get("ttl"), null);
});

void test("expired entries are reclaimed before live entries are evicted", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  await memoryCacheClient.set("live-oldest", "keep", 60);
  for (let i = 0; i < 255; i++) {
    await memoryCacheClient.set(`expired:${i}`, i, 1);
  }
  t.mock.timers.tick(1000);
  await memoryCacheClient.set("new", "new", 60);
  assert.equal(await memoryCacheClient.get("live-oldest"), "keep");
  assert.equal(await memoryCacheClient.get("expired:254"), null);
});

void test("overwriting releases the previous payload budget", async () => {
  const payload = "a".repeat(1024 * 1024 - 2);
  for (let i = 0; i < 8; i++) {
    await memoryCacheClient.set(`large:${i}`, payload, 60);
  }
  await memoryCacheClient.set("large:7", "small", 60);
  await memoryCacheClient.set("extra", "a".repeat(1024 * 1024 - 9), 60);
  assert.equal(await memoryCacheClient.get("large:0"), payload);
  assert.equal(await memoryCacheClient.get("large:7"), "small");
});

void test("clear releases the payload budget as well as all entries", async () => {
  const payload = "a".repeat(1024 * 1024 - 2);
  for (let i = 0; i < 8; i++) {
    await memoryCacheClient.set(`old:${i}`, payload, 60);
  }
  clearMemoryCache();
  for (let i = 0; i < 8; i++) {
    await memoryCacheClient.set(`new:${i}`, payload, 60);
  }
  assert.equal(await memoryCacheClient.get("old:7"), null);
  assert.equal(await memoryCacheClient.get("new:0"), payload);
});

void test("caller mutations cannot grow or alter retained snapshots", async () => {
  const payload = { hits: [{ content: "original" }] };
  await memoryCacheClient.set("snapshot", payload, 60);
  payload.hits[0].content = "changed";
  const first = await memoryCacheClient.get<typeof payload>("snapshot");
  assert.deepEqual(first, { hits: [{ content: "original" }] });
  assert.ok(first);
  first.hits.push({ content: "added" });
  assert.deepEqual(await memoryCacheClient.get("snapshot"), {
    hits: [{ content: "original" }],
  });
});

for (const ttl of [0, -1, Number.NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
  void test(`invalid TTL ${String(ttl)} removes an existing entry`, async () => {
    await memoryCacheClient.set("replace", "old", 60);
    await memoryCacheClient.set("replace", "new", ttl);
    assert.equal(await memoryCacheClient.get("replace"), null);
  });
}

const circular: { self?: unknown } = {};
circular.self = circular;
const unsupportedValues: Array<[string, unknown]> = [
  ["oversized", "a".repeat(1024 * 1024)],
  ["undefined", undefined],
  ["function", () => "value"],
  ["symbol", Symbol("value")],
  ["bigint", 1n],
  ["circular", circular],
  ["map", new Map([["key", "value"]])],
  ["nested function", { value: () => "value" }],
  ["nonfinite number", { score: Infinity }],
  [
    "throwing serialization",
    {
      toJSON: () => {
        throw new Error("invalid");
      },
    },
  ],
];

for (const [label, value] of unsupportedValues) {
  void test(`${label} replacement safely removes an existing entry`, async () => {
    await memoryCacheClient.set("replace", "old", 60);
    await assert.doesNotReject(memoryCacheClient.set("replace", value, 60));
    assert.equal(await memoryCacheClient.get("replace"), null);
  });
}

void test("response and retrieval shaped JSON payloads round trip", async () => {
  const response = { output: "Answer", citations: '[{"id":"chunk"}]' };
  const retrieval = {
    contextBlock: "Context",
    included: [
      {
        id: "chunk",
        content: "Text",
        metadata: { title: "Title" },
        prunedChunk: "Text",
        clipped: false,
        tokenCount: 1,
      },
    ],
    dropped: 0,
    totalTokens: 1,
    insufficient: false,
    highestScore: 0.9,
  };
  await memoryCacheClient.set("response", response, 60);
  await memoryCacheClient.set("retrieval", retrieval, 60);
  assert.deepEqual(await memoryCacheClient.get("response"), response);
  assert.deepEqual(await memoryCacheClient.get("retrieval"), retrieval);
});
