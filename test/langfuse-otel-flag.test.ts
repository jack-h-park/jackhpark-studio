import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { isOtelTracingEnabled } from "@/lib/langfuse";

const env = process.env as Record<string, string | undefined>;

void describe("LANGFUSE_OTEL_TRACING rollout switch", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = env.LANGFUSE_OTEL_TRACING;
    delete env.LANGFUSE_OTEL_TRACING;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete env.LANGFUSE_OTEL_TRACING;
    } else {
      env.LANGFUSE_OTEL_TRACING = saved;
    }
  });

  void it("defaults to the OTel backend when unset", () => {
    assert.equal(isOtelTracingEnabled(), true);
  });

  void it('falls back to the legacy backend only for exactly "0"', () => {
    // This is the rollback contract: setting LANGFUSE_OTEL_TRACING=0 on the
    // Production scope reverts the transport without a revert commit or a
    // rebuild. If this stops working, the migration loses its cheap undo.
    env.LANGFUSE_OTEL_TRACING = "0";
    assert.equal(isOtelTracingEnabled(), false);
  });

  void it("treats any other value as enabled", () => {
    for (const value of ["1", "true", "", "no"]) {
      env.LANGFUSE_OTEL_TRACING = value;
      assert.equal(
        isOtelTracingEnabled(),
        true,
        `expected ${JSON.stringify(value)} to leave OTel enabled`,
      );
    }
  });
});
