import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import { ingestionLogger } from "@/lib/logging/logger";
import { clearFaviconCache, fetchFaviconForUrl } from "@/lib/rag/fetch-favicon";

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

  void it("retries a host when the first attempt failed and caches only the success", async () => {
    let callCount = 0;
    globalThis.fetch = () => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.reject(new Error("timeout"));
      }

      const html =
        '<html><head><link rel="icon" href="https://example.com/new-favicon.ico"></head><body></body></html>';
      return Promise.resolve(
        new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    };

    const first = await fetchFaviconForUrl("https://retry-host.com/page", {
      timeoutMs: 50,
      maxRedirects: 1,
    });
    assert.strictEqual(first, null);

    const second = await fetchFaviconForUrl("https://retry-host.com/again", {
      timeoutMs: 50,
      maxRedirects: 1,
    });
    assert.strictEqual(second, "https://example.com/new-favicon.ico");
    assert.strictEqual(callCount, 2);

    const third = await fetchFaviconForUrl("https://retry-host.com/more", {
      timeoutMs: 50,
      maxRedirects: 1,
    });
    assert.strictEqual(third, "https://example.com/new-favicon.ico");
    assert.strictEqual(callCount, 2);
  });

  void it("logs a single start when concurrent requests share an inflight fetch", async () => {
    const logEntries: unknown[] = [];
    const originalDebug = ingestionLogger.debug;
    ingestionLogger.debug = (_message, payload) => {
      logEntries.push(payload);
    };

    try {
      const fetchState = {
        resolve: null as ((response: Response) => void) | null,
      };
      globalThis.fetch = () =>
        new Promise((resolve) => {
          fetchState.resolve = resolve;
        });

      const promise = Promise.all([
        fetchFaviconForUrl("https://log-host.com/page-a", {
          timeoutMs: 50,
          maxRedirects: 1,
        }),
        fetchFaviconForUrl("https://log-host.com/page-b", {
          timeoutMs: 50,
          maxRedirects: 1,
        }),
      ]);

      const html =
        '<html><head><link rel="icon" href="/favicon-logging.ico"></head><body></body></html>';
      if (fetchState.resolve) {
        fetchState.resolve(
          new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        );
      }

      const [first, second] = await promise;

      assert.strictEqual(first, "https://log-host.com/favicon-logging.ico");
      assert.strictEqual(second, "https://log-host.com/favicon-logging.ico");

      const startEvents = logEntries.filter(
        (entry) => (entry as Record<string, unknown>)?.event === "start",
      );
      const resolvedEvents = logEntries.filter(
        (entry) => (entry as Record<string, unknown>)?.event === "resolved",
      );

      assert.strictEqual(startEvents.length, 1);
      assert.strictEqual(resolvedEvents.length, 1);
    } finally {
      ingestionLogger.debug = originalDebug;
    }
  });
});
