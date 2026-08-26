import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { getAppEnv } from "@/lib/langfuse";

const ENV_KEYS = ["APP_ENV", "VERCEL_ENV", "NODE_ENV"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

// process.env.NODE_ENV is typed readonly; the tests need to drive it directly.
const env = process.env as Record<string, string | undefined>;

void describe("getAppEnv deploy-target resolution", () => {
  const savedEnv: Partial<Record<EnvKey, string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = env[key];
      delete env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }
  });

  void it("prefers an explicit APP_ENV over the deploy target", () => {
    env.APP_ENV = "dev";
    env.VERCEL_ENV = "production";
    env.NODE_ENV = "production";

    assert.equal(getAppEnv(), "dev");
  });

  void it("separates Vercel preview from production despite NODE_ENV=production", () => {
    // The regression this guards: Vercel builds Preview with
    // NODE_ENV=production, so without consulting VERCEL_ENV every preview
    // trace was tagged "prod".
    env.VERCEL_ENV = "preview";
    env.NODE_ENV = "production";

    assert.equal(getAppEnv(), "preview");
  });

  void it("maps Vercel production to prod", () => {
    env.VERCEL_ENV = "production";
    env.NODE_ENV = "production";

    assert.equal(getAppEnv(), "prod");
  });

  void it("maps Vercel development to dev", () => {
    env.VERCEL_ENV = "development";
    env.NODE_ENV = "production";

    assert.equal(getAppEnv(), "dev");
  });

  void it("falls back to NODE_ENV when no deploy target is present", () => {
    env.NODE_ENV = "production";

    assert.equal(getAppEnv(), "prod");
  });

  void it("treats local development as dev", () => {
    env.NODE_ENV = "development";

    assert.equal(getAppEnv(), "dev");
  });
});
