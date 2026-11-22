import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import { AutoPassTimeoutError } from "@/lib/server/rag/auto-rag-decision";
import { runOptionalPass } from "@/lib/server/rag/optional-pass";

// Removing child abort or parent propagation must fail these lifecycle checks.
void test("deadline aborts the child and leaves its parent usable", async () => {
  const parent = new AbortController();
  let child: AbortSignal | undefined;
  const pending = runOptionalPass(
    (signal) => {
      child = signal;
      return new Promise<never>(() => {});
    },
    10,
    parent.signal,
  );
  await assert.rejects(pending, AutoPassTimeoutError);
  assert.equal(child?.aborted, true);
  assert.equal(parent.signal.aborted, false);
  assert.ok(child?.reason instanceof AutoPassTimeoutError);
});

void test("parent abort rejects immediately even if the operation ignores it", async () => {
  const parent = new AbortController();
  const reason = new Error("request canceled");
  let child: AbortSignal | undefined;
  const pending = runOptionalPass(
    (signal) => {
      child = signal;
      return new Promise<never>(() => {});
    },
    100,
    parent.signal,
  );
  parent.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(child?.aborted, true);
  assert.equal(child?.reason, reason);
});

void test("already-aborted parent starts no operation", async () => {
  const parent = new AbortController();
  parent.abort();
  let started = false;
  await assert.rejects(
    runOptionalPass(
      async () => {
        started = true;
      },
      10,
      parent.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(started, false);
});

void test("success clears its deadline and detaches the parent listener", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const parent = new AbortController();
  let child: AbortSignal | undefined;
  assert.equal(
    await runOptionalPass(
      async (signal) => {
        child = signal;
        return "base answer";
      },
      10,
      parent.signal,
    ),
    "base answer",
  );
  t.mock.timers.tick(20);
  parent.abort();
  assert.equal(child?.aborted, false);
});

void test("late operation rejection after timeout is observed", async () => {
  let rejectLate!: (error: Error) => void;
  const pending = runOptionalPass(
    () =>
      new Promise<never>((_, reject) => {
        rejectLate = reject;
      }),
    10,
  );
  await assert.rejects(pending, AutoPassTimeoutError);
  rejectLate(new Error("late provider failure"));
  await setImmediate();
});

void test("synchronous operation failure also releases its parent listener", async () => {
  const parent = new AbortController();
  let child: AbortSignal | undefined;
  const failure = new Error("provider unavailable");
  await assert.rejects(
    runOptionalPass(
      (signal) => {
        child = signal;
        throw failure;
      },
      10,
      parent.signal,
    ),
    (error) => error === failure,
  );
  parent.abort();
  assert.equal(child?.aborted, false);
});
