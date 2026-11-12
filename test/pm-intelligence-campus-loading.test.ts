import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";

import { readCampus } from "../components/pm-intelligence-world/three/readCampus";

const raw = Uint8Array.from([103, 108, 84, 70, 2, 0, 0, 0]);
const encoded = () => Uint8Array.from(gzipSync(raw));

void test("native gzip decoding returns exact original model bytes with one request", async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(url);
    return new Response(encoded());
  });
  assert.deepEqual(new Uint8Array(await readCampus()), raw);
  assert.deepEqual(requests, [
    "/experiences/pm-intelligence/observatory/campus.glb.gz",
  ]);
});

void test("browsers without native decompression use the original model", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "DecompressionStream",
  )!;
  Object.defineProperty(globalThis, "DecompressionStream", {
    value: undefined,
    configurable: true,
  });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(url);
    return new Response(raw);
  });
  try {
    assert.deepEqual(new Uint8Array(await readCampus()), raw);
    assert.deepEqual(requests, [
      "/experiences/pm-intelligence/observatory/campus.glb",
    ]);
  } finally {
    Object.defineProperty(globalThis, "DecompressionStream", descriptor);
  }
});

void test("invalid compressed responses fall back once to the original model", async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(url);
    return new Response(url.endsWith(".gz") ? new Uint8Array([1, 2, 3]) : raw);
  });
  assert.deepEqual(new Uint8Array(await readCampus()), raw);
  assert.equal(requests.length, 2);
  assert.ok(requests[1].endsWith("campus.glb"));
});

void test("leaving the world aborts its download without starting a fallback", async (t) => {
  const controller = new AbortController();
  let requests = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      requests++;
      assert.equal(init.signal, controller.signal);
      controller.abort();
      throw new DOMException("Cancelled", "AbortError");
    },
  );
  await assert.rejects(readCampus(controller.signal), { name: "AbortError" });
  assert.equal(requests, 1);
});

void test("unavailable compressed and original assets report a load failure", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(null, { status: 404 });
  });
  await assert.rejects(readCampus(), /404/);
  assert.equal(requests, 2);
});

void test("the published gzip asset expands to the unchanged canonical model", () => {
  const model = readFileSync(
    new URL(
      "../public/experiences/pm-intelligence/observatory/campus.glb",
      import.meta.url,
    ),
  );
  const compressed = readFileSync(
    new URL(
      "../public/experiences/pm-intelligence/observatory/campus.glb.gz",
      import.meta.url,
    ),
  );
  assert.deepEqual(gunzipSync(compressed), model);
  assert.ok(
    compressed.length < model.length / 2,
    "The compressed path must materially reduce transfer size",
  );
});
