import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";

import { invalidateByTag } from "@vercel/functions";

import {
  invalidatePublicChatShell,
  PUBLIC_CHAT_CACHE_TAG,
} from "@/lib/server/public-chat-cache";

const contextSymbol = Symbol.for("@vercel/request-context");
function installContext(t: TestContext, context: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, contextSymbol);
  const vercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  Object.defineProperty(globalThis, contextSymbol, {
    configurable: true,
    value: context === undefined ? undefined : { get: () => context },
  });
  t.after(() => {
    if (descriptor)
      Object.defineProperty(globalThis, contextSymbol, descriptor);
    else Reflect.deleteProperty(globalThis, contextSymbol);
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
  });
}

for (const [name, context] of [
  ["absent", undefined],
  ["empty", {}],
  ["cache-only", { cache: { get() {}, set() {}, expireTag() {} } }],
  ["empty purge", { purge: {} }],
  ["non-callable purge", { purge: { invalidateByTag: true } }],
] as const) {
  void test(`${name} context cannot falsely acknowledge CDN invalidation`, async (t) => {
    installContext(t, context);
    if (name === "absent") {
      // This is the installed SDK, not a fake that always calls the platform.
      await invalidateByTag(PUBLIC_CHAT_CACHE_TAG);
    }
    await assert.rejects(invalidatePublicChatShell(), {
      code: "purge_context_unavailable",
    });
  });
}

void test("valid request purge is awaited exactly once and acknowledges only a request", async (t) => {
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const calls: unknown[] = [];
  const purge = {
    invalidateByTag(tag: unknown) {
      assert.equal(this, purge);
      calls.push(tag);
      return waiting;
    },
  };
  installContext(t, { purge });
  let settled = false;
  const pending = invalidatePublicChatShell().then((result) => {
    settled = true;
    return result;
  });
  await setImmediate();
  assert.equal(settled, false);
  assert.deepEqual(calls, [PUBLIC_CHAT_CACHE_TAG]);
  finish();
  assert.equal(await pending, "invalidation-requested");
  assert.equal(calls.length, 1);
});

void test("platform rejection is sanitized and never retried", async (t) => {
  let calls = 0;
  installContext(t, {
    purge: {
      invalidateByTag() {
        calls++;
        throw new Error("PRIVATE_PLATFORM_TOKEN");
      },
    },
  });
  await assert.rejects(invalidatePublicChatShell(), (error: unknown) => {
    assert.equal((error as { code?: unknown }).code, "purge_failed");
    assert.equal(String(error).includes("PRIVATE_PLATFORM_TOKEN"), false);
    return true;
  });
  assert.equal(calls, 1);
});

void test("local execution skips all platform APIs", async (t) => {
  installContext(t, {
    purge: {
      invalidateByTag() {
        assert.fail("local execution must not invalidate");
      },
    },
  });
  delete process.env.VERCEL;
  assert.equal(await invalidatePublicChatShell(), "skipped-local");
});

for (const get of [
  true,
  () => {
    throw new Error("PRIVATE_CONTEXT_FAILURE");
  },
]) {
  void test("malformed context access remains a safe capability failure", async (t) => {
    installContext(t, {});
    Object.defineProperty(globalThis, contextSymbol, {
      configurable: true,
      value: { get },
    });
    await assert.rejects(invalidatePublicChatShell(), (error: unknown) => {
      assert.equal(
        (error as { code?: unknown }).code,
        "purge_context_unavailable",
      );
      assert.equal(String(error).includes("PRIVATE_CONTEXT_FAILURE"), false);
      return true;
    });
  });
}
