import assert from "node:assert/strict";
import test from "node:test";

import { db } from "@/lib/db";
import { resolveNotionPage } from "@/lib/resolve-notion-page";

void test("the resolver itself rejects scanner inputs before cache or sitemap access", async (t) => {
  t.mock.method(db, "get", async () => {
    throw new Error("unexpected cache lookup");
  });
  for (const rawId of ["xmlrpc.php", ".env", "constructor", "__proto__"]) {
    const props = await resolveNotionPage("example.com", rawId);
    assert.equal(props.error?.statusCode, 404);
    assert.equal(props.error?.code, "UNKNOWN_ROUTE");
    assert.equal(props.recordMap, undefined);
  }
});
