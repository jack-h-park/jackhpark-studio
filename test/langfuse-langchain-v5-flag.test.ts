// Pins the rollout switch for the v5 LangChain handler.
//
// The contract that matters is the shape of the revert: an opt-out, so that
// backing the swap out on production is an environment variable rather than a
// revert commit. That only holds while the v3 handler is still in the tree.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { isLangchainV5Enabled } from "@/lib/server/langchain/langfuse-callbacks";

const env = process.env;
const saved = env.LANGFUSE_LANGCHAIN_V5;

afterEach(() => {
  if (saved === undefined) {
    delete env.LANGFUSE_LANGCHAIN_V5;
  } else {
    env.LANGFUSE_LANGCHAIN_V5 = saved;
  }
});

void describe("LANGFUSE_LANGCHAIN_V5 rollout switch", () => {
  void it("defaults to the v5 handler when unset", () => {
    delete env.LANGFUSE_LANGCHAIN_V5;
    assert.equal(isLangchainV5Enabled(), true);
  });

  void it('falls back to the v3 handler only on exactly "0"', () => {
    env.LANGFUSE_LANGCHAIN_V5 = "0";
    assert.equal(isLangchainV5Enabled(), false);
  });

  void it("treats any other value as enabled", () => {
    for (const value of ["1", "true", "", "no", "false"]) {
      env.LANGFUSE_LANGCHAIN_V5 = value;
      assert.equal(
        isLangchainV5Enabled(),
        true,
        `expected ${JSON.stringify(value)} to leave v5 enabled`,
      );
    }
  });
});
