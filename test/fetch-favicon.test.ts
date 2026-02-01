import assert from "node:assert";
import { afterEach,beforeEach, describe, it } from "node:test";

import {
  clearFaviconCache,
  fetchFaviconForUrl,
} from "@/lib/rag/fetch-favicon";

const originalFetch = globalThis.fetch;

void describe("fetchFaviconForUrl safety", () => {
  beforeEach(() => {
    clearFaviconCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  void it("returns null when the favicon fetch times out", async () => {
    globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("Aborted"));
        });
      });

    const result = await fetchFaviconForUrl("https://example.com", {
      timeoutMs: 10,
      maxRedirects: 0,
    });

    assert.strictEqual(result, null);
  });

  void it("blocks favicon redirects that end up on private IPs", async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "http://192.168.0.1/favicon.ico" },
        }),
      );

    const result = await fetchFaviconForUrl("https://example.com", {
      timeoutMs: 50,
      maxRedirects: 2,
    });

    assert.strictEqual(result, null);
  });

  void it("caches favicon lookups per hostname", async () => {
    let callCount = 0;
    globalThis.fetch = () => {
      callCount += 1;
      const html =
        '<html><head><link rel="icon" href="/favicon-test.ico"></head><body></body></html>';
      return Promise.resolve(
        new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    };

    const first = await fetchFaviconForUrl("https://example.com/page", {
      timeoutMs: 50,
      maxRedirects: 1,
    });
    const second = await fetchFaviconForUrl("https://example.com/other", {
      timeoutMs: 50,
      maxRedirects: 1,
    });

    assert.strictEqual(first, "https://example.com/favicon-test.ico");
    assert.strictEqual(second, "https://example.com/favicon-test.ico");
    assert.strictEqual(callCount, 1);
  });
});
