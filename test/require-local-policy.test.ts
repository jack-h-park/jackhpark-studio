import assert from "node:assert";
import test from "node:test";

import { resolveRequireLocalEnforcement } from "@/lib/server/chat-settings";

test("requireLocal enforcement resolves to local_ok when backend available", () => {
  const result = resolveRequireLocalEnforcement(true, true, true);
  assert.equal(result.enforcement, "local_ok");
  assert.equal(result.shouldFallbackToCloud, false);
});

test("requireLocal enforcement blocks when backend missing", () => {
  const result = resolveRequireLocalEnforcement(true, true, false);
  assert.equal(result.enforcement, "blocked_require_local");
  assert.equal(result.shouldFallbackToCloud, false);
});

test("requireLocal=false falls back to cloud when backend missing", () => {
  const result = resolveRequireLocalEnforcement(false, true, false);
  assert.equal(result.enforcement, "fallback_to_cloud");
  assert.equal(result.shouldFallbackToCloud, true);
});

test("cloud preset with requireLocal=false remains cloud_ok", () => {
  const result = resolveRequireLocalEnforcement(false, false, false);
  assert.equal(result.enforcement, "cloud_ok");
  assert.equal(result.shouldFallbackToCloud, false);
});
