import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
// Probe the installed SDK's fallback, never a live cache or credentials.
const { BuildCache } = require(
  path.join(
    path.dirname(require.resolve("@vercel/functions")),
    "cache/build-client.js",
  ),
) as {
  BuildCache: new (options: {
    endpoint: string;
    headers: Record<string, string>;
    onError: (error: unknown) => void;
  }) => {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
  };
};
void test("the installed SDK fallback swallows a failed write and maps a cache miss to null", async (t) => {
  const failures: unknown[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "https://offline.invalid/marker");
      return new Response(null, {
        status: init?.method === "POST" ? 500 : 404,
      });
    },
  );
  const cache = new BuildCache({
    endpoint: "https://offline.invalid/",
    headers: {},
    onError: (error) => {
      failures.push(error);
    },
  });
  await cache.set("marker", "new");
  assert.equal(failures.length, 1);
  assert.equal(await cache.get("marker"), null);
});
void test("the installed SDK fallback hides stale marker values until the response is fresh", async (t) => {
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    assert.equal(String(input), "https://offline.invalid/marker");
    reads++;
    return Response.json("new", {
      status: 200,
      headers: { "x-vercel-cache-state": reads === 1 ? "stale" : "fresh" },
    });
  });
  const cache = new BuildCache({
    endpoint: "https://offline.invalid/",
    headers: {},
    onError: () => {
      assert.fail("unexpected SDK error");
    },
  });
  assert.equal(await cache.get("marker"), null);
  assert.equal(await cache.get("marker"), "new");
});
