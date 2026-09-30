import assert from "node:assert/strict";
import test from "node:test";

import type { SiteMap } from "@/lib/types";
import { createDynamicNotionStaticProps } from "@/lib/server/dynamic-notion-static-props";

const loadSiteMap = async () =>
  ({
    site: {
      name: "Example",
      domain: "example.com",
      rootNotionPageId: "root",
      rootNotionSpaceId: null,
    },
    pageMap: {},
    canonicalPageMap: { beluga: "page-id" },
  }) satisfies SiteMap;
const unexpectedLookup = async (): Promise<never> => {
  throw new Error("invalid paths must not perform a lookup");
};

void test("scanner paths return a permanent 404 without resolving content or the sitemap", async () => {
  const render = createDynamicNotionStaticProps(
    "example.com",
    unexpectedLookup,
    unexpectedLookup,
  );
  for (const pageId of [
    "xmlrpc.php",
    ".env",
    "photo.jpg",
    "api",
    "admin",
    "_next",
    "constructor",
    "__proto__",
    "a/b",
    "",
    "37899029-c0b4-801b9425-fe5857860ca7",
  ]) {
    assert.deepEqual(
      await render({ params: { pageId } }),
      { notFound: true },
      pageId,
    );
  }
});

void test("an unresolved slug publishes a real 404 rather than error props with status 200", async () => {
  const render = createDynamicNotionStaticProps(
    "example.com",
    async () => ({
      error: {
        statusCode: 404,
        message: 'Not found "unknown"',
        code: "UNKNOWN_ROUTE",
      },
    }),
    loadSiteMap,
  );
  assert.deepEqual(await render({ params: { pageId: "unknown" } }), {
    notFound: true,
    revalidate: 3600,
  });
});

void test("an unclassified invalid Notion record fails instead of poisoning the ISR cache with a 404", async () => {
  const render = createDynamicNotionStaticProps(
    "example.com",
    async () => ({
      error: { statusCode: 404, message: "Invalid upstream record" },
    }),
    loadSiteMap,
  );
  await assert.rejects(
    async () => render({ params: { pageId: "beluga" } }),
    /Invalid upstream record/,
  );
});

void test("upstream fetch failures propagate for both ordinary and manual regeneration", async () => {
  const failure = new Error("Notion 429");
  const render = createDynamicNotionStaticProps(
    "example.com",
    async () => {
      throw failure;
    },
    loadSiteMap,
  );
  for (const revalidateReason of ["stale", "on-demand"] as const) {
    await assert.rejects(
      async () => render({ params: { pageId: "beluga" }, revalidateReason }),
      failure,
    );
  }
});

void test("supported slugs and Notion IDs retain normal ISR and manual force-refresh behavior", async () => {
  const render = createDynamicNotionStaticProps(
    "example.com",
    async (_domain, pageId, options) => ({
      pageId,
      recordMap: undefined,
      site: undefined,
      canonicalPageMap: {
        freshness: options?.forceRefresh ? "fresh" : "cached",
      },
    }),
    loadSiteMap,
  );
  for (const pageId of [
    "beluga",
    "project-2a-jackgpt--ai-chat",
    "37899029c0b4801b9425fe5857860ca7",
    "37899029-c0b4-801b-9425-fe5857860ca7",
  ]) {
    for (const revalidateReason of ["stale", "on-demand"] as const) {
      const capture = createDynamicNotionStaticProps(
        "example.com",
        async (domain, rawId, options) => {
          assert.equal(domain, "example.com");
          assert.equal(rawId, pageId);
          assert.equal(options?.forceRefresh, revalidateReason === "on-demand");
          return { pageId };
        },
        loadSiteMap,
      );
      assert.deepEqual(
        await capture({ params: { pageId }, revalidateReason }),
        {
          props: { pageId, canonicalPageMap: { beluga: "page-id" } },
          revalidate: 3600,
        },
      );
    }
    assert.equal("props" in (await render({ params: { pageId } })), true);
  }
});
