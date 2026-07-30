import assert from "node:assert/strict";
import test from "node:test";

import { getNextImageProxyUrl } from "@/lib/next-image-proxy";

const NOTION_SRC =
  "https://www.notion.so/image/attachment%3Aabc%3Acover.png?table=block&id=123&cache=v2";

void test("proxies remote notion urls through the next image optimizer", () => {
  const url = getNextImageProxyUrl(NOTION_SRC, 348);

  assert.ok(url);
  const parsed = new URL(url, "http://localhost");
  assert.equal(parsed.pathname, "/_next/image");
  assert.equal(parsed.searchParams.get("url"), NOTION_SRC);
  assert.equal(parsed.searchParams.get("q"), "75");
});

const width = (renderedWidth: number) =>
  new URL(
    getNextImageProxyUrl(NOTION_SRC, renderedWidth)!,
    "http://localhost",
  ).searchParams.get("w");

void test("snaps the requested width up to an allowed optimizer bucket", () => {
  assert.equal(width(348), "384");
  assert.equal(width(640), "640");
  assert.equal(width(700), "750");
  // Never below a usable size, never above the cap.
  assert.equal(width(0), "1080");
  assert.equal(width(4000), "2048");
});

void test("returns null when there is nothing to proxy", () => {
  // Already proxied — the server can't reach the host either, so a retry loops.
  assert.equal(
    getNextImageProxyUrl("/_next/image?url=https%3A%2F%2Fx.dev%2Fa.png&w=640"),
    null,
  );
  assert.equal(
    getNextImageProxyUrl(
      "http://localhost:3000/_next/image?url=https%3A%2F%2Fx.dev%2Fa.png&w=640",
    ),
    null,
  );
  // Same-origin and inline sources are never host-blocked.
  assert.equal(getNextImageProxyUrl("/assets/avatar.png"), null);
  assert.equal(getNextImageProxyUrl("data:image/png;base64,AAAA"), null);
});
