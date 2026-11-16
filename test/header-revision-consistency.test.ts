import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import type { ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import { rootNotionPageId } from "@/lib/config";
import { verifyHeaderRevision } from "@/lib/server/header-revision-verification";
import { createNotionNavigationHeaderLoader } from "@/lib/server/notion-header";

const rootId = parsePageId(rootNotionPageId, { uuid: true })!;
const rootMap = {
  block: {
    [rootId]: {
      role: "reader",
      value: { id: rootId, type: "page", properties: { title: [["Fixture"]] } },
    },
  },
  collection: {},
  collection_view: {},
  collection_query: {},
  notion_user: {},
  signed_urls: {},
} as unknown as ExtendedRecordMap;

const observations = (overrides = {}) => ({
  attempts: 3,
  missing: 0,
  previous: 0,
  different: 0,
  invalid: 0,
  waitedMs: 350,
  ...overrides,
});

void test("one revision write tolerates two delayed previous-value reads before becoming visible", async () => {
  let current: unknown = "old";
  let writes = 0;
  let lag = 0;
  const waits: number[] = [];
  const loader = createNotionNavigationHeaderLoader({
    fetchRoot: async () => rootMap,
    now: () => 0,
    wait: async (ms: number) => {
      waits.push(ms);
    },
    store: {
      get: async () => (lag-- > 0 ? "old" : current),
      set: async (_key, value) => {
        writes++;
        current = value;
        lag = 2;
      },
    },
  });
  assert.deepEqual(await loader.invalidate(), observations({ previous: 2 }));
  assert.equal(writes, 1);
  assert.deepEqual(waits, [100, 250]);
});

for (const mode of ["missing", "previous", "different", "invalid"] as const) {
  void test(`persistent ${mode} readback is bounded and never repaired by overwriting another writer`, async () => {
    let written = false;
    let writes = 0;
    const waits: number[] = [];
    const values = {
      missing: null,
      previous: "old",
      different: "another-generation",
      invalid: { private: "DO_NOT_LOG" },
    };
    const loader = createNotionNavigationHeaderLoader({
      fetchRoot: async () => rootMap,
      now: () => 0,
      wait: async (ms: number) => {
        waits.push(ms);
      },
      store: {
        get: async () => (written ? values[mode] : "old"),
        set: async () => {
          writes++;
          written = true;
        },
      },
    });
    await assert.rejects(loader.invalidate(), (error: unknown) => {
      const e = error as Error & { code: string; verification: unknown };
      assert.equal(
        e.code,
        mode === "different" ? "revision_changed" : "revision_not_retained",
      );
      assert.deepEqual(e.verification, observations({ [mode]: 3 }));
      assert.ok(!JSON.stringify(e).includes("DO_NOT_LOG"));
      return true;
    });
    assert.equal(writes, 1);
    assert.deepEqual(waits, [100, 250]);
  });
}

void test("an explicit write rejection remains a write failure without verification retries", async () => {
  const waits: number[] = [];
  const loader = createNotionNavigationHeaderLoader({
    fetchRoot: async () => rootMap,
    now: () => 0,
    wait: async (ms: number) => {
      waits.push(ms);
    },
    store: {
      get: async () => "old",
      set: async () => {
        throw new Error("PRIVATE_DRIVER_ERROR");
      },
    },
  });
  await assert.rejects(loader.invalidate(), { code: "revision_write_failed" });
  assert.deepEqual(waits, []);
});

void test("a delayed missing read cannot initialize over a completed local invalidation", async () => {
  let release!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const entries = new Map<string, unknown>();
  let first = true;
  const writes: unknown[] = [];
  const loader = createNotionNavigationHeaderLoader({
    fetchRoot: async () => rootMap,
    now: () => 0,
    store: {
      get: async (key) => {
        if (first) {
          first = false;
          entered();
          await paused;
          return null;
        }
        return entries.get(key);
      },
      set: async (key, value) => {
        writes.push(value);
        entries.set(key, value);
      },
    },
  });
  const pending = loader();
  await started;
  await loader.invalidate();
  const fresh = writes[0];
  release();
  await pending;
  assert.equal(writes.filter((v) => typeof v === "string").length, 1);
  assert.ok([...entries.values()].includes(fresh));
});

void test("local invalidation waits for an older initialization write and owns the final revision", async (t) => {
  let release!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  t.after(() => release());
  const entries = new Map<string, unknown>();
  const writes: unknown[] = [];
  let first = true;
  const loader = createNotionNavigationHeaderLoader({
    fetchRoot: async () => rootMap,
    now: () => 0,
    store: {
      get: async (key) => entries.get(key),
      set: async (key, value) => {
        if (typeof value === "string") {
          writes.push(value);
          if (first) {
            first = false;
            entered();
            await paused;
          }
        }
        entries.set(key, value);
      },
    },
  });
  const pending = loader();
  await started;
  let finished = false;
  const invalidation = loader.invalidate().then(() => {
    finished = true;
  });
  await setImmediate();
  assert.equal(
    finished,
    false,
    "invalidation must not finish before an older write",
  );
  release();
  await Promise.all([pending, invalidation]);
  assert.equal(writes.length, 2);
  assert.ok([...entries.values()].includes(writes[1]));
  assert.ok(![...entries.values()].includes(writes[0]));
});

void test("a deferred purge that removes the replacement marker remains a bounded failure", async () => {
  let current: unknown = "old";
  let purgePending = false;
  let writes = 0;
  const loader = createNotionNavigationHeaderLoader({
    fetchRoot: async () => rootMap,
    now: () => 0,
    wait: async () => {},
    store: {
      invalidate: async () => {
        purgePending = true;
      },
      set: async (_key, value) => {
        writes++;
        current = value;
      },
      get: async () => {
        // Model tag invalidation taking effect after the replacement write.
        // This is an offline failure scenario, not a platform timing guarantee.
        if (purgePending) current = null;
        return current;
      },
    },
  });
  await assert.rejects(loader.invalidate(), (error: unknown) => {
    const e = error as Error & { code: string; verification: unknown };
    assert.equal(e.code, "revision_not_retained");
    assert.deepEqual(e.verification, observations({ missing: 3 }));
    return true;
  });
  assert.equal(writes, 1);
});

void test("missing readback can recover without another write", async () => {
  let reads = 0;
  assert.deepEqual(
    await verifyHeaderRevision({
      read: async () => (++reads === 1 ? null : "expected"),
      expected: "expected",
      previous: "old",
      wait: async () => {},
    }),
    observations({ attempts: 2, missing: 1, waitedMs: 100 }),
  );
});

void test("a read exception retains earlier observations without exposing values", async () => {
  let reads = 0;
  await assert.rejects(
    verifyHeaderRevision({
      read: async () => {
        if (++reads === 1) return null;
        throw new Error("PRIVATE");
      },
      expected: "expected",
      previous: "old",
      wait: async () => {},
    }),
    (error: unknown) => {
      const e = error as Error & { code: string; verification: unknown };
      assert.equal(e.code, "revision_read_failed");
      assert.deepEqual(
        e.verification,
        observations({ attempts: 2, missing: 1, waitedMs: 100 }),
      );
      assert.ok(!JSON.stringify(e).includes("PRIVATE"));
      return true;
    },
  );
});
