import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import test from "node:test";

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
    query: { prompt: "REQUEST_SENTINEL" },
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

for (const url of [
  "/chat?prompt=REQUEST_SENTINEL",
  "/_next/data/build/chat.json?prompt=REQUEST_SENTINEL",
]) {
  void test(`anonymous shell caches public props and ignores cookies/query for ${url}`, async () => {
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
