import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import test, { type TestContext } from "node:test";

import type { GetServerSidePropsContext } from "next";
import type { ExtendedRecordMap } from "notion-types";

import * as publicPage from "@/lib/server/public-chat-page";

import {
  chatConfigFixture,
  runtimeMetaFixture,
} from "./helpers/public-chat-fixtures";

const header = {
  headerBlockId: "root",
  headerRecordMap: {
    block: {},
    collection: {},
    collection_query: {},
    collection_view: {},
    notion_user: {},
    signed_urls: {},
  } as ExtendedRecordMap,
};

function platformContext(t: TestContext, value: unknown) {
  const symbol = Symbol.for("@vercel/request-context");
  const previous = Object.getOwnPropertyDescriptor(globalThis, symbol);
  const vercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  Object.defineProperty(globalThis, symbol, {
    configurable: true,
    value: { get: () => value },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, symbol, previous);
    else Reflect.deleteProperty(globalThis, symbol);
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
  });
}

void test("cacheable HTML and data register the chat tag alongside runtime dependency tags", async (t) => {
  const tags = new Set(["www.example.test:production:notion-header:v1"]);
  const calls: unknown[] = [];
  platformContext(t, {
    addCacheTag(tag: string) {
      calls.push(tag);
      tags.add(tag);
    },
  });
  for (const url of ["/chat", "/_next/data/build/chat.json"]) {
    const ctx = context(url);
    await loader()(ctx);
    assert.equal(ctx.res.getHeader("Vercel-Cache-Tag"), "public-chat-shell-v1");
  }
  assert.deepEqual(calls, ["public-chat-shell-v1", "public-chat-shell-v1"]);
  assert.deepEqual(
    [...tags],
    ["www.example.test:production:notion-header:v1", "public-chat-shell-v1"],
  );
});

for (const capability of [
  undefined,
  {},
  { addCacheTag: true },
  {
    addCacheTag() {
      throw new Error("PRIVATE_PLATFORM_FAILURE");
    },
  },
  {
    async addCacheTag() {
      throw new Error("PRIVATE_PLATFORM_FAILURE");
    },
  },
]) {
  void test("unavailable or failed production tag registration keeps the visible page private", async (t) => {
    platformContext(t, capability);
    const ctx = context();
    const result = await loader()(ctx);
    assert.ok("props" in result);
    assert.equal(ctx.res.getHeader("Cache-Control"), "private, no-store");
    assert.equal(ctx.res.getHeader("Vercel-Cache-Tag"), undefined);
  });
}

void test("private HTML and data never register the shared chat tag", async (t) => {
  platformContext(t, {
    addCacheTag() {
      assert.fail("private response was tagged");
    },
  });
  for (const url of ["/chat", "/_next/data/build/chat.json"]) {
    const ctx = context(url);
    ctx.query = { prompt: "PRIVATE_SENTINEL" };
    await loader()(ctx);
    assert.equal(ctx.res.getHeader("Cache-Control"), "private, no-store");
  }
});

function context(url = "/chat"): GetServerSidePropsContext {
  const req = new IncomingMessage(
    new Socket(),
  ) as GetServerSidePropsContext["req"];
  req.url = url;
  Object.defineProperty(req, "cookies", {
    get() {
      throw new Error("cookies must never be consulted");
    },
  });
  req.headers.cookie = "session=REQUEST_SENTINEL";
  return {
    req,
    res: new ServerResponse(req),
    query: {},
    resolvedUrl: url,
  };
}

function loader(
  overrides: Partial<
    Parameters<typeof publicPage.createPublicChatPageLoader>[0]
  > = {},
) {
  assert.equal(
    typeof publicPage.createPublicChatPageLoader,
    "function",
    "SSR factory must exist",
  );
  return publicPage.createPublicChatPageLoader({
    loadConfig: async (options) => {
      assert.deepEqual(options, { forceRefresh: true });
      return chatConfigFixture();
    },
    loadHeader: async () => header,
    buildRuntimeMeta: () => runtimeMetaFixture(),
    ...overrides,
  });
}

for (const url of ["/chat", "/_next/data/build/chat.json"]) {
  void test(`empty-query anonymous shell is public and identical with cookies for ${url}`, async () => {
    const ctx = context(url);
    const result = await loader()(ctx);
    assert.equal(
      ctx.res.getHeader("Cache-Control"),
      "public, max-age=0, s-maxage=900, stale-while-revalidate=60",
    );
    assert.equal(ctx.res.getHeader("Vercel-Cache-Tag"), "public-chat-shell-v1");
    assert.equal(JSON.stringify(result).includes("SENTINEL"), false);
    assert.equal(JSON.stringify(result).includes("localLlmBackendEnv"), false);
    assert.equal("revalidate" in result, false);
    assert.ok("props" in result);
    const plain = context();
    delete plain.req.headers.cookie;
    plain.query = {};
    assert.deepEqual(result, await loader()(plain));
  });
}

for (const url of [
  "/chat?prompt=REQUEST_SENTINEL",
  "/_next/data/build/chat.json?prompt=REQUEST_SENTINEL",
]) {
  void test(`query-bearing response is private because Next serializes query independently of props for ${url}`, async () => {
    const ctx = context(url);
    const query = { prompt: "REQUEST_SENTINEL" };
    ctx.query = query;
    ctx.res.setHeader("Vercel-Cache-Tag", "old-tag");
    const result = await loader()(ctx);
    assert.equal(ctx.res.getHeader("Cache-Control"), "private, no-store");
    assert.equal(ctx.res.getHeader("Vercel-Cache-Tag"), undefined);
    assert.equal(ctx.query, query);
    assert.deepEqual(query, { prompt: "REQUEST_SENTINEL" });
    assert.equal(ctx.req.url, url);
    assert.equal(ctx.resolvedUrl, url);
    assert.equal(JSON.stringify(result).includes("SENTINEL"), false);
    assert.deepEqual(result, await loader()(context()));
  });
}

void test("query presence bypasses cache without reading its values", async () => {
  const ctx = context("/chat?flag");
  Object.defineProperty(ctx.query, "flag", {
    enumerable: true,
    get() {
      throw new Error(
        "query values must never be consulted by the shell loader",
      );
    },
  });
  await loader()(ctx);
  assert.equal(ctx.res.getHeader("Cache-Control"), "private, no-store");
  assert.equal(ctx.res.getHeader("Vercel-Cache-Tag"), undefined);
});

for (const mode of [
  "authorization",
  "draft",
  "preview",
  "personalized",
  "missing-header",
  "status-error",
  "set-cookie",
]) {
  void test(`${mode} response is private with no cache tag`, async () => {
    const ctx = context();
    ctx.res.setHeader("Vercel-Cache-Tag", "old-tag");
    if (mode === "authorization")
      ctx.req.headers.authorization = "Bearer REQUEST_SENTINEL";
    if (mode === "draft") ctx.draftMode = true;
    if (mode === "preview") ctx.preview = true;
    if (mode === "status-error") ctx.res.statusCode = 503;
    if (mode === "set-cookie")
      ctx.res.setHeader("Set-Cookie", "sentinel=secret");
    await loader({
      isPersonalized: () => mode === "personalized",
      loadHeader: async () =>
        mode === "missing-header"
          ? { headerRecordMap: null, headerBlockId: "root" }
          : header,
    })(ctx);
    assert.equal(ctx.res.getHeader("Cache-Control"), "private, no-store");
    assert.equal(ctx.res.getHeader("Vercel-Cache-Tag"), undefined);
  });
}

void test("configuration errors retain private headers before propagating", async () => {
  const ctx = context();
  await assert.rejects(
    loader({
      loadConfig: async () => {
        throw new Error("read failed");
      },
    })(ctx),
    /read failed/,
  );
  assert.equal(ctx.res.getHeader("Cache-Control"), "private, no-store");
  assert.equal(ctx.res.getHeader("Vercel-Cache-Tag"), undefined);
});

void test("each miss reads fresh configuration rather than retaining another instance's module cache", async () => {
  let reads = 0;
  const load = loader({
    loadConfig: async () => {
      const config = chatConfigFixture();
      config.baseSystemPromptSummary = `Revision ${++reads}`;
      return config;
    },
  });
  const first = await load(context());
  const second = await load(context());
  assert.ok("props" in first && "props" in second);
  const firstProps = await first.props;
  const secondProps = await second.props;
  assert.equal(firstProps.adminConfig.baseSystemPromptSummary, "Revision 1");
  assert.equal(secondProps.adminConfig.baseSystemPromptSummary, "Revision 2");
});

void test("an unverified fallback header stays visible but is never CDN-cached or serialized with its policy hint", async () => {
  const ctx = context();
  ctx.res.setHeader("Vercel-Cache-Tag", "old-tag");
  const result = await loader({
    loadHeader: async () => ({ ...header, cacheable: false as const }),
  })(ctx);
  assert.equal(ctx.res.getHeader("Cache-Control"), "private, no-store");
  assert.equal(ctx.res.getHeader("Vercel-Cache-Tag"), undefined);
  assert.ok("props" in result);
  const props = await result.props;
  assert.deepEqual(props.headerRecordMap, header.headerRecordMap);
  assert.equal(Object.hasOwn(props, "cacheable"), false);
});
