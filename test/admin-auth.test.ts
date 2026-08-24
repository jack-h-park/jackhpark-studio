import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedAdminEmail } from "@/lib/admin/auth";

void test("matches the single allowlisted administrator email case-insensitively", () => {
  assert.equal(
    isAllowedAdminEmail(" Admin@Example.com ", "admin@example.com"),
    true,
  );
  assert.equal(
    isAllowedAdminEmail("other@example.com", "admin@example.com"),
    false,
  );
  assert.equal(isAllowedAdminEmail("admin@example.com", undefined), false);
});
