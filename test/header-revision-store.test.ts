import assert from "node:assert/strict";
import test from "node:test";

import { createClient } from "@supabase/supabase-js";

import { createDurableHeaderRevisionStore } from "@/lib/server/notion-header-revision-store";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const key = "notion-header:v2:example.test:production:root:revision";
function fixture() {
  const rows = new Map<string, unknown>();
  const calls: {
    method: string;
    url: URL;
    headers: Headers;
    body: Record<string, unknown> | null;
  }[] = [];
  let fail = false;
  let drop = false;
  const client = createClient("https://offline.invalid", "offline-test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://offline.invalid");
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);
        const body =
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null;
        calls.push({ method, url, headers, body });
        if (fail)
          return Response.json(
            { message: "PRIVATE_DRIVER_FAILURE", code: "OFFLINE" },
            { status: 500 },
          );
        if (method === "GET") {
          const storageKey = url.searchParams.get("key")?.slice(3) ?? "";
          return Response.json(
            rows.has(storageKey) ? [{ value: rows.get(storageKey) }] : [],
          );
        }
        assert.equal(method, "POST");
        assert.equal(typeof body?.key, "string");
        const storageKey = body!.key as string;
        if (
          headers.get("prefer")?.includes("ignore-duplicates") &&
          rows.has(storageKey)
        )
          return Response.json([]);
        if (!drop) rows.set(storageKey, body!.value);
        if (headers.get("accept")?.includes("vnd.pgrst.object"))
          return Response.json(drop ? null : { value: rows.get(storageKey) });
        return Response.json(drop ? [] : [{ value: rows.get(storageKey) }]);
      },
    },
  });
  return {
    rows,
    calls,
    client,
    fail: () => {
      fail = true;
    },
    drop: () => {
      drop = true;
    },
  };
}
void test("construction is lazy and revision rows cannot overwrite chat configuration", async () => {
  const f = fixture();
  let clients = 0;
  const store = createDurableHeaderRevisionStore({
    client: () => {
      clients++;
      return f.client;
    },
  });
  assert.equal(clients, 0);
  await store.set(key, first);
  assert.equal(f.calls[0].url.pathname, "/rest/v1/system_settings");
  assert.match(
    String(f.calls[0].body?.key),
    /^notion_header_revision:v1:[a-f0-9]{64}$/,
  );
  assert.notEqual(f.calls[0].body?.key, "admin_chat_config");
  assert.equal(await store.get(key), first);
  assert.deepEqual(store.diagnostics(), {
    backend: "supabase-primary",
    invalidation: "durable-revision",
  });
});
void test("insert-if-absent initialization adopts the winner without overwriting it", async () => {
  const f = fixture();
  const a = createDurableHeaderRevisionStore({ client: () => f.client });
  const b = createDurableHeaderRevisionStore({ client: () => f.client });
  const values = await Promise.all([
    a.initialize(key, first),
    b.initialize(key, second),
  ]);
  assert.deepEqual(values, [first, first]);
  assert.equal(f.rows.size, 1);
  assert.equal([...f.rows.values()][0], first);
  assert.ok(
    f.calls
      .filter((c) => c.method === "POST")
      .every((c) => c.headers.get("prefer")?.includes("ignore-duplicates")),
  );
});
void test("missing rows are ordinary misses; malformed existing rows cannot become an initializer", async () => {
  const f = fixture();
  const store = createDurableHeaderRevisionStore({ client: () => f.client });
  assert.equal(await store.get(key), null);
  await store.set(key, first);
  f.rows.set([...f.rows.keys()][0], { private: "PRIVATE" });
  await assert.rejects(store.get(key), { code: "invalid_revision" });
});
for (const operation of ["get", "set", "initialize"] as const)
  void test(`${operation} rejects database errors without exposing driver messages`, async () => {
    const f = fixture();
    f.fail();
    const store = createDurableHeaderRevisionStore({ client: () => f.client });
    await assert.rejects(
      operation === "get"
        ? store.get(key)
        : operation === "set"
          ? store.set(key, first)
          : store.initialize(key, first),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes("PRIVATE"));
        return true;
      },
    );
  });
void test("an acknowledged write with no returned marker is not success", async () => {
  const f = fixture();
  f.drop();
  const store = createDurableHeaderRevisionStore({ client: () => f.client });
  await assert.rejects(store.set(key, first), {
    code: "revision_not_retained",
  });
  await assert.rejects(store.initialize(key, first), {
    code: "revision_not_retained",
  });
});

void test("primary queries receive a finite deadline and timeout errors stay bounded", async (t) => {
  let deadlines = 0;
  let aborted = false;
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    deadlines++;
    assert.equal(ms, 5000);
    return AbortSignal.abort(
      new DOMException("PRIVATE_TIMEOUT", "TimeoutError"),
    );
  });
  const client = createClient("https://offline.invalid", "offline-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        aborted = init?.signal?.aborted === true;
        throw new Error("PRIVATE_TIMEOUT");
      },
    },
  });
  const store = createDurableHeaderRevisionStore({ client: () => client });
  await assert.rejects(store.get(key), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(
      (error as Error & { code: string }).code,
      "revision_read_failed",
    );
    assert.ok(!error.message.includes("PRIVATE"));
    return true;
  });
  assert.equal(deadlines, 1);
  assert.equal(aborted, true);
});
