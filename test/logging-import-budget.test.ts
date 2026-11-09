import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { runInThisContext } from "node:vm";

import { build } from "esbuild";

import type { LoggingConfig } from "@/lib/logging/types";

type Module = {
  resolveLoggingEnv(): LoggingConfig["env"];
  buildDomainLoggingState(): unknown;
  buildLoggingConfig(): Promise<LoggingConfig>;
  fixture: { initialized: number; reads: number; fail: boolean };
};

void test("logging fallbacks avoid database/tracing initialization while full config preserves control rules", async (t) => {
  const keys = [
    "APP_ENV",
    "VERCEL_ENV",
    "NODE_ENV",
    "TELEMETRY_ENABLED",
    "TELEMETRY_SAMPLE_RATE_MAX",
    "TELEMETRY_DETAIL_MAX",
    "TELEMETRY_SAMPLE_RATE_OVERRIDE",
    "TELEMETRY_DETAIL_OVERRIDE",
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.APP_ENV = "prod";
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.TELEMETRY_ENABLED = "true";
  process.env.TELEMETRY_SAMPLE_RATE_MAX = "0.5";
  process.env.TELEMETRY_DETAIL_MAX = "standard";
  process.env.TELEMETRY_SAMPLE_RATE_OVERRIDE = "0.2";
  process.env.TELEMETRY_DETAIL_OVERRIDE = "minimal";
  const bundle = await build({
    entryPoints: ["lib/logging/config.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    banner: { js: "const fixture={initialized:0,reads:0,fail:false};" },
    footer: { js: "module.exports.fixture=fixture;" },
    plugins: [
      {
        name: "database-boundary",
        setup(b) {
          b.onResolve(
            { filter: /^@\/lib\/server\/admin-chat-config$/ },
            () => ({ path: "admin", namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents: `
        fixture.initialized++;
        export async function getAdminChatConfig() {
          fixture.reads++;
          if(fixture.fail) throw new Error('Database unavailable');
          return {telemetry:{sampleRate:0.8,detailLevel:'verbose'}};
        }
      `,
          }));
        },
      },
    ],
  });
  const realRequire = createRequire(import.meta.url);
  const guardedRequire = (id: string): unknown => {
    assert.ok(
      !/^@(?:langfuse|opentelemetry|supabase)\//.test(id),
      `Pure logging fallback must not load SDK ${id}`,
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
  const container = { exports: {} };
  execute(guardedRequire, container, container.exports);
  const module = container.exports as Module;
  assert.equal(module.fixture.initialized, 0);
  assert.equal(module.resolveLoggingEnv(), "production");
  module.buildDomainLoggingState();
  assert.equal(module.fixture.initialized, 0);
  const prod = await module.buildLoggingConfig();
  assert.equal(module.fixture.initialized, 1);
  assert.equal(module.fixture.reads, 1);
  assert.deepEqual(prod.telemetry, {
    enabled: true,
    sampleRate: 0.5,
    detailLevel: "standard",
  });
  delete process.env.APP_ENV;
  process.env.VERCEL_ENV = "preview";
  const preview = await module.buildLoggingConfig();
  assert.equal(preview.env, "preview");
  assert.deepEqual(preview.telemetry, {
    enabled: true,
    sampleRate: 0.2,
    detailLevel: "minimal",
  });
  process.env.TELEMETRY_ENABLED = "false";
  assert.equal((await module.buildLoggingConfig()).telemetry.enabled, false);
  module.fixture.fail = true;
  await assert.rejects(module.buildLoggingConfig(), /Database unavailable/);
});
