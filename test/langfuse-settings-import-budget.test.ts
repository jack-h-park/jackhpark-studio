import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { runInThisContext } from "node:vm";

import { build } from "esbuild";

type SettingsModule = {
  loadLangfuseSettings(): Promise<{
    envTag: string;
    attachProviderMetadata: boolean;
  }>;
};

void test("environment settings preserve Preview tagging when telemetry SDKs cannot load", async (t) => {
  const saved = {
    APP_ENV: process.env.APP_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    LANGFUSE_ENV_TAG: process.env.LANGFUSE_ENV_TAG,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  delete process.env.APP_ENV;
  delete process.env.LANGFUSE_ENV_TAG;
  process.env.VERCEL_ENV = "preview";
  Object.assign(process.env, { NODE_ENV: "production" });
  const bundle = await build({
    entryPoints: ["lib/server/settings/langfuse-settings.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
  });
  const realRequire = createRequire(import.meta.url);
  const guardedRequire = (id: string): unknown => {
    assert.ok(
      !id.startsWith("@langfuse/") && !id.startsWith("@opentelemetry/"),
      `Environment settings must not initialize tracing SDK: ${id}`,
    );
    return realRequire(id);
  };
  const execute = runInThisContext(
    `(function(require,module,exports){${bundle.outputFiles[0].text}\n})`,
  ) as (
    require: (id: string) => unknown,
    module: { exports: unknown },
    exports: unknown,
  ) => void;
  const module = { exports: {} };
  execute(guardedRequire, module, module.exports);
  const settings = await (
    module.exports as SettingsModule
  ).loadLangfuseSettings();
  assert.equal(settings.envTag, "preview");
});
