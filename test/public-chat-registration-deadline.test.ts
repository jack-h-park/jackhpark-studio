import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

async function moduleUnderTest() {
  const result = await build({
    entryPoints: ["lib/server/public-chat-cache.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: { js: "const logs=[];" },
    footer: { js: "export {logs};" },
    plugins: [
      {
        name: "diagnostic-boundary",
        setup(b) {
          b.onResolve({ filter: /^@vercel\/functions$/ }, () => ({
            path: pathToFileURL(
              createRequire(import.meta.url).resolve("@vercel/functions"),
            ).href,
            external: true,
          }));
          b.onResolve({ filter: /^@\/lib\/logging\/logger$/ }, () => ({
            path: "logger",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const notionLogger={error:(message,payload)=>logs.push({message,payload})};",
          }));
        },
      },
    ],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${Math.random()}`).toString("base64")}`
  ) as Promise<{
    registerPublicChatCacheTag(): Promise<boolean>;
    logs: { message: string; payload: { reason: string } }[];
  }>;
}

function context(t: TestContext, value: unknown) {
  const symbol = Symbol.for("@vercel/request-context");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, symbol);
  const vercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  Object.defineProperty(globalThis, symbol, {
    configurable: true,
    value: { get: () => value },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, symbol, descriptor);
    else Reflect.deleteProperty(globalThis, symbol);
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
  });
}

for (const lateOutcome of ["resolve", "reject"] as const) {
  void test(`registration deadline returns false and handles a late ${lateOutcome} without retry`, async (t) => {
    const module = await moduleUnderTest();
    let calls = 0;
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    context(t, {
      addCacheTag() {
        calls++;
        return new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        });
      },
    });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pending = module.registerPublicChatCacheTag();
    t.mock.timers.tick(500);
    const observed = await Promise.race([
      pending,
      setImmediate().then(() => "pending"),
    ]);
    // Release the fake SDK even on a failed regression assertion.
    if (lateOutcome === "resolve") resolve();
    else reject(new Error("PRIVATE_PLATFORM_TOKEN"));
    assert.equal(observed, false);
    assert.equal(await pending, false);
    await setImmediate();
    assert.equal(calls, 1);
    assert.equal(module.logs[0]?.payload.reason, "deadline_exceeded");
    assert.equal(
      JSON.stringify(module.logs).includes("PRIVATE_PLATFORM_TOKEN"),
      false,
    );
  });
}

void test("diagnostics distinguish failure reasons and throttle only logs, never registration", async (t) => {
  const module = await moduleUnderTest();
  let calls = 0;
  let missing = true;
  let rejected = true;
  context(t, {
    addCacheTag() {
      calls++;
      if (rejected) throw new Error("PRIVATE_PLATFORM_TOKEN");
      return Promise.resolve();
    },
  });
  const symbol = Symbol.for("@vercel/request-context");
  const installed = (globalThis as Record<symbol, unknown>)[symbol];
  Object.defineProperty(globalThis, symbol, {
    configurable: true,
    value: {
      get: () => (missing ? {} : (installed as { get(): unknown }).get()),
    },
  });
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  for (let i = 0; i < 3; i++)
    assert.equal(await module.registerPublicChatCacheTag(), false);
  missing = false;
  for (let i = 0; i < 3; i++)
    assert.equal(await module.registerPublicChatCacheTag(), false);
  assert.deepEqual(
    module.logs.map((log) => log.payload.reason),
    ["capability_unavailable", "sdk_rejected"],
  );
  assert.equal(calls, 3);
  t.mock.timers.tick(60_000);
  assert.equal(await module.registerPublicChatCacheTag(), false);
  assert.equal(calls, 4);
  assert.equal(module.logs.length, 3);
  for (const log of module.logs) {
    assert.equal(log.message, "public_chat_tag_registration_unconfirmed");
    assert.deepEqual(Object.keys(log.payload).toSorted(), [
      "deadlineMs",
      "reason",
      "sharedCache",
    ]);
  }
  rejected = false;
  assert.equal(await module.registerPublicChatCacheTag(), true);
  assert.equal(calls, 5);
  assert.equal(module.logs.length, 3);
  assert.equal(
    JSON.stringify(module.logs).includes("PRIVATE_PLATFORM_TOKEN"),
    false,
  );
});

void test("successful registration clears its deadline without another SDK attempt", async (t) => {
  const module = await moduleUnderTest();
  let calls = 0;
  context(t, {
    addCacheTag: async () => {
      calls++;
    },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const clear = t.mock.method(globalThis, "clearTimeout");
  assert.equal(await module.registerPublicChatCacheTag(), true);
  assert.equal(clear.mock.callCount(), 1);
  t.mock.timers.tick(1000);
  assert.equal(calls, 1);
  assert.equal(module.logs.length, 0);
});
