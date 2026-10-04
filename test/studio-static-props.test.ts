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

for (const reason of ["stale", "build"] as const) {
  void test(`studio ${reason} propagates upstream failures rather than publishing a not-found artifact`, async (t) => {
    t.mock.method(console, "error", () => {});
    const failure = new Error("Notion unavailable");
    const getStaticProps = createStudioStaticProps(async () => {
      throw failure;
    });

    await assert.rejects(
      async () => getStaticProps({ revalidateReason: reason }),
      failure,
    );
  });
}

void test("studio does not publish an error-shaped page as a healthy ISR artifact", async (t) => {
  t.mock.method(console, "error", () => {});
  const getStaticProps = createStudioStaticProps(async () => ({
    error: { statusCode: 500, message: "Unable to read page" },
  }));
  await assert.rejects(
    async () => getStaticProps({ revalidateReason: "stale" }),
    /Unable to read page/,
  );
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
