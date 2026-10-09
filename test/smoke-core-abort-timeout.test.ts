import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as wait } from "node:timers/promises";

import { withAbortTimeout } from "@/scripts/smoke/lib/smoke-core";

void describe("withAbortTimeout", () => {
  void it("returns as soon as a fast action resolves", async () => {
    const startedAt = performance.now();
    const result = await withAbortTimeout(3000, async () => 1);
    const elapsedMs = performance.now() - startedAt;

    assert.equal(result, 1);
    assert.ok(elapsedMs < 500, `expected < 500 ms, took ${elapsedMs} ms`);
  });

  void it("aborts a slow action and rejects at the timeout", async () => {
    let observedSignal: AbortSignal | undefined;
    const startedAt = performance.now();

    await assert.rejects(
      withAbortTimeout(100, async (signal) => {
        observedSignal = signal;
        await wait(5000, undefined, { signal });
      }),
      { name: "AbortError" },
    );
    const elapsedMs = performance.now() - startedAt;

    assert.equal(observedSignal?.aborted, true);
    assert.ok(elapsedMs >= 90, `expected >= 90 ms, took ${elapsedMs} ms`);
    assert.ok(elapsedMs < 1000, `expected < 1000 ms, took ${elapsedMs} ms`);
  });
});
