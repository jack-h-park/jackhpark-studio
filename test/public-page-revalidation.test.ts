import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePublicPageRevalidationTarget } from "@/lib/server/public-page-revalidation";

const canonicalPageMap = { beluga: "notion-page-id" };

void describe("public page revalidation targets", () => {
  void it("accepts only studio or a canonical single-segment slug", () => {
    assert.deepEqual(
      resolvePublicPageRevalidationTarget("/studio", canonicalPageMap),
      { path: "/studio" },
    );
    assert.deepEqual(
      resolvePublicPageRevalidationTarget("/beluga", canonicalPageMap),
      { path: "/beluga" },
    );
  });

  void it("rejects paths that are not one canonical public page", () => {
    for (const target of [
      "https://example.com/beluga",
      "/beluga?x=1",
      "/beluga#x",
      "/admin",
      "/api",
      "/api/ping",
      "/.env",
      "/photo.jpg",
      "/unknown",
      "/a/b",
    ]) {
      assert.equal(
        resolvePublicPageRevalidationTarget(target, canonicalPageMap),
        null,
        target,
      );
    }
  });

  void it("rejects prototype and reserved names even when they appear allowed", () => {
    const reservedPageMap = {
      admin: "notion-admin-id",
      api: "notion-api-id",
      beluga: "notion-page-id",
    };

    for (const target of ["/constructor", "/admin", "/api"]) {
      assert.equal(
        resolvePublicPageRevalidationTarget(target, reservedPageMap),
        null,
        target,
      );
    }
  });
});
