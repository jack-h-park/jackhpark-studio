import assert from "node:assert/strict";
import test from "node:test";

import { build } from "esbuild";

void test("header store audit allows only bounded backend labels, not internal cache fields", async () => {
  const result = await build({
    entryPoints: ["lib/server/admin-auth.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: { js: "const audits=[];" },
    footer: { js: "export {audits};" },
    plugins: [
      {
        name: "audit-boundaries",
        setup(b) {
          const modules: Record<string, string> = {
            "next-auth/next":
              "export async function getServerSession(){return null;}",
            "@/lib/server/auth": "export const authOptions={};",
            "@/lib/logging/logger":
              "export const dbLogger={info:(name,data)=>audits.push({name,data})};",
          };
          b.onResolve({ filter: /.*/ }, (a) =>
            modules[a.path]
              ? { path: a.path, namespace: "fixture" }
              : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents: modules[a.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  )) as {
    auditAdminMutation(input: unknown): void;
    audits: { name: string; data: { cacheVerification: unknown } }[];
  };
  const store = {
    backend: "request-context",
    invalidation: "runtime-expire-tag",
    endpoint: "PRIVATE",
    headers: "PRIVATE",
    revision: "PRIVATE",
  };
  module.auditAdminMutation({
    actorEmail: "admin@example.test",
    requestId: "fixture",
    action: "revalidate",
    target: "/studio",
    result: "failure",
    cacheVerification: {
      attempts: 3,
      missing: 3,
      previous: 0,
      different: 0,
      invalid: 0,
      waitedMs: 350,
      store,
    },
  });
  assert.deepEqual(module.audits[0].data.cacheVerification, {
    attempts: 3,
    missing: 3,
    previous: 0,
    different: 0,
    invalid: 0,
    waitedMs: 350,
    store: { backend: "request-context", invalidation: "runtime-expire-tag" },
  });
  assert.ok(!JSON.stringify(module.audits).includes("PRIVATE"));
});
