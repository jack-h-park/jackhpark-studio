import assert from "node:assert/strict";
import { afterEach,beforeEach, describe, it } from "node:test";

import { buildDomainLoggingState } from "@/lib/logging/config";

const ENV_KEYS = ["LOG_GLOBAL_LEVEL", "LOG_DB_LEVEL"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

void describe("logging config domain overrides", () => {
  const savedEnv: Partial<Record<EnvKey, string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  void it("falls back to the global level when LOG_DB_LEVEL is unset", () => {
    process.env.LOG_GLOBAL_LEVEL = "error";
    delete process.env.LOG_DB_LEVEL;

    const state = buildDomainLoggingState("local");
    assert.equal(state.db.level, "error");
  });

  void it("honors LOG_DB_LEVEL when provided", () => {
    process.env.LOG_GLOBAL_LEVEL = "error";
    process.env.LOG_DB_LEVEL = "debug";

    const state = buildDomainLoggingState("local");
    assert.equal(state.db.level, "debug");
    assert.equal(state.rag.level, "error");
  });
});
