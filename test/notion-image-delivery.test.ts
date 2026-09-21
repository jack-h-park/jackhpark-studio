import assert from "node:assert/strict";
import test from "node:test";

import {
  getNotionImageDelivery,
  inferNotionImageRole,
} from "@/lib/notion-image-delivery";

const NOTION_SRC =
  "https://www.notion.so/image/attachment%3Aabc%3Acover.png?table=block&id=123&cache=v2";

/** Every `<url> <n>w` descriptor's width, in the order the srcSet lists them. */
function ladderWidths(srcSet: string | undefined): number[] {
  assert.ok(srcSet, "expected a srcSet");
  return srcSet
    .split(", ")
    .map((entry) => Number(entry.split(" ")[1]?.slice(0, -1)));
}

function requestedWidth(url: string): string | null {
  return new URL(url, "http://localhost").searchParams.get("w");
}

void test("icons ask for one small width rather than a ladder", () => {
  const delivery = getNotionImageDelivery(NOTION_SRC, "icon");

  assert.ok(delivery);
  assert.equal(delivery.srcSet, undefined);
  assert.equal(delivery.sizes, undefined);
  assert.equal(requestedWidth(delivery.src), "256");
});

void test("card covers ask for grid-sized widths and describe the grid", () => {
  const delivery = getNotionImageDelivery(NOTION_SRC, "card-cover");

  assert.ok(delivery);
  assert.deepEqual(ladderWidths(delivery.srcSet), [384, 640, 828]);
  assert.equal(delivery.sizes, "(max-width: 640px) 100vw, 360px");
});

void test("content images keep a retina rung for medium-zoom", () => {
  const delivery = getNotionImageDelivery(NOTION_SRC, "content");

  assert.ok(delivery);
  assert.deepEqual(ladderWidths(delivery.srcSet), [828, 1200, 1920]);
  assert.equal(delivery.sizes, "(max-width: 768px) 100vw, 720px");
});

void test("the plain src is the widest rung, for browsers ignoring srcSet", () => {
  for (const role of ["card-cover", "content"] as const) {
    const delivery = getNotionImageDelivery(NOTION_SRC, role);
    assert.ok(delivery);
    const widths = ladderWidths(delivery.srcSet);
    assert.equal(
      requestedWidth(delivery.src),
      String(widths.at(-1)),
      `${role} should fall back to its widest rung`,
    );
  }
});

void test("every rung points at the optimizer and carries the source url", () => {
  const delivery = getNotionImageDelivery(NOTION_SRC, "content");

  assert.ok(delivery?.srcSet);
  for (const entry of delivery.srcSet.split(", ")) {
    const parsed = new URL(entry.split(" ")[0]!, "http://localhost");
    assert.equal(parsed.pathname, "/_next/image");
    assert.equal(parsed.searchParams.get("url"), NOTION_SRC);
    assert.equal(parsed.searchParams.get("q"), "75");
  }
});

void test("sources the optimizer cannot serve get no delivery at all", () => {
  // Relative assets and data URIs are rejected by the optimizer; an
  // already-proxied URL would nest one optimizer request inside another.
  assert.equal(getNotionImageDelivery("/assets/avatar.png", "icon"), null);
  assert.equal(
    getNotionImageDelivery("data:image/png;base64,AAA", "icon"),
    null,
  );
  assert.equal(
    getNotionImageDelivery(
      `/_next/image?url=${NOTION_SRC}&w=640&q=75`,
      "content",
    ),
    null,
  );
});

void test("role is inferred from the only class name react-notion-x gives us", () => {
  assert.equal(inferNotionImageRole("icon notion-page-icon"), "icon");
  assert.equal(
    inferNotionImageRole("notion-page-icon-inline notion-page-icon-image"),
    "content",
    "the inline wrapper class alone is not the icon <img> class",
  );
  assert.equal(inferNotionImageRole("notion-image-inset"), "content");
  assert.equal(inferNotionImageRole(undefined), "content");
});
