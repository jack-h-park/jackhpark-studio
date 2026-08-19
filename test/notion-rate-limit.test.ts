import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { withRateLimitRetry } from "@/lib/notion-rate-limit";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readRepoFile(relative: string): Promise<string> {
  return readFile(path.join(repoRoot, relative), "utf8");
}

// Real backoff is seconds; the tests drive it at 1ms so they exercise the same code path
// without waiting. Attempt counts, not delays, are what the behaviour depends on.
const fast = { baseDelayMs: 1 };

void describe("withRateLimitRetry", () => {
  void it("returns the first success without retrying", async () => {
    let calls = 0;
    const result = await withRateLimitRetry(async () => {
      calls += 1;
      return "ok";
    }, fast);
    assert.equal(result, "ok");
    assert.equal(calls, 1);
  });

  void it("retries a 429 until it succeeds", async () => {
    let calls = 0;
    const result = await withRateLimitRetry(async () => {
      calls += 1;
      if (calls < 3) throw new Error("Request failed with status code 429");
      return "recovered";
    }, fast);
    assert.equal(result, "recovered");
    assert.equal(calls, 3);
  });

  void it("gives up after maxAttempts and rethrows the last 429", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRateLimitRetry(async () => {
          calls += 1;
          throw new Error("429 Too Many Requests");
        }, fast),
      /429/,
    );
    // Five attempts total, not five retries after the first.
    assert.equal(calls, 5);
  });

  void it("does not retry errors that are not rate limits", async () => {
    // A 403 is the shape this repo actually hits when the API base URL is wrong. Retrying
    // it would turn an instant, legible failure into a slow one.
    let calls = 0;
    await assert.rejects(
      () =>
        withRateLimitRetry(async () => {
          calls += 1;
          throw new Error("Request failed with status code 403");
        }, fast),
      /403/,
    );
    assert.equal(calls, 1);
  });

  void it("honours a caller-supplied attempt budget", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRateLimitRetry(
          async () => {
            calls += 1;
            throw new Error("429");
          },
          { ...fast, maxAttempts: 2 },
        ),
      /429/,
    );
    assert.equal(calls, 2);
  });
});

void describe("one retry implementation", () => {
  void it("is imported by both Notion bulk callers rather than redefined", async () => {
    const [siteMap, ingestor] = await Promise.all([
      readRepoFile("lib/get-site-map.ts"),
      readRepoFile("lib/admin/manual-ingestor.ts"),
    ]);

    for (const [name, source] of [
      ["lib/get-site-map.ts", siteMap],
      ["lib/admin/manual-ingestor.ts", ingestor],
    ] as const) {
      assert.match(
        source,
        /import \{ withRateLimitRetry \} from "\.\.?\/(\.\.\/)?notion-rate-limit"/,
        `${name} must import the shared retry helper`,
      );
      assert.doesNotMatch(
        source,
        /(async )?function withRateLimitRetry/,
        `${name} must not define its own retry — the two would drift on attempt counts`,
      );
    }
  });
});
