import assert from "node:assert/strict";
import test from "node:test";

import type handler from "@/pages/api/admin/revalidate-public-page";

type ResponseBody = Parameters<Parameters<typeof handler>[1]["json"]>[0];
type Success = Extract<ResponseBody, { revalidatedPath: string }>;

const acknowledged: Success = {
  revalidatedPath: "/studio",
  revalidatedAt: "2026-11-17T21:59:19.092Z",
  requestId: "fixture-request",
  chatCacheRefresh: "invalidation-requested",
};

void test("the declared refresh success contract includes correlation and requested cache state", () => {
  assert.equal(acknowledged.requestId, "fixture-request");
  assert.equal(acknowledged.chatCacheRefresh, "invalidation-requested");
});
