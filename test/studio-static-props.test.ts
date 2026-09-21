import assert from "node:assert/strict";
import test from "node:test";

import { createStudioStaticProps } from "@/lib/server/studio-static-props";

void test("manual studio regeneration propagates an upstream failure so Next retains its healthy artifact", async (t) => {
  t.mock.method(console, "error", () => {});
  const failure = new Error("Notion unavailable");
  const getStaticProps = createStudioStaticProps(async () => {
    throw failure;
  });

  await assert.rejects(
    async () => getStaticProps({ revalidateReason: "on-demand" }),
    failure,
  );
});

void test("ordinary studio ISR retains its short retry fallback", async (t) => {
  t.mock.method(console, "error", () => {});
  const getStaticProps = createStudioStaticProps(async () => {
    throw new Error("Notion unavailable");
  });

  assert.deepEqual(await getStaticProps({ revalidateReason: "stale" }), {
    notFound: true,
    revalidate: 10,
  });
});

void test("studio manual regeneration requests a fresh page while ordinary ISR uses the normal cache", async (t) => {
  t.mock.method(console, "log", () => {});
  const getStaticProps = createStudioStaticProps(
    async (_domain, _pageId, options) => ({
      pageId: options?.forceRefresh ? "fresh" : "cached",
    }),
  );

  assert.deepEqual(await getStaticProps({ revalidateReason: "on-demand" }), {
    props: { pageId: "fresh" },
    revalidate: 3600,
  });
  assert.deepEqual(await getStaticProps({ revalidateReason: "stale" }), {
    props: { pageId: "cached" },
    revalidate: 3600,
  });
});
