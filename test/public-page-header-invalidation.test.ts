import assert from "node:assert/strict";
import test from "node:test";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";

async function refresh(path: string, failure = "") {
  const result = await build({
    entryPoints: ["pages/api/admin/revalidate-public-page.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: { js: "const events = [];" },
    footer: { js: "export {events};" },
    plugins: [
      {
        name: "external-boundaries",
        setup(b) {
          const modules: Record<string, string> = {
            "@/lib/get-site-map":
              "export async function getSiteMap() { return {canonicalPageMap:{beluga:'fixture'}}; }",
            "@/lib/server/admin-auth":
              "export async function requireAdminApiAccess(){return {id:'fixture'};} export function requireSameOriginMutation(){return true;} export function auditAdminMutation(){}",
            "@/lib/server/notion-header": `export async function invalidateNotionNavigationHeader(){ events.push('header'); ${failure === "header" ? "throw Error('down');" : ""} }`,
            "@/lib/server/public-chat-cache":
              "export async function invalidatePublicChatShell(){events.push('chat');return 'invalidated';}",
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
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${Math.random()}`).toString("base64")}`
  )) as {
    default(req: NextApiRequest, res: NextApiResponse): Promise<void>;
    events: string[];
  };
  let status = 200;
  const res = {
    revalidate: async (target: string) => {
      module.events.push(target);
      if (failure === "page") throw new Error("page failed");
    },
    status(code: number) {
      status = code;
      return this;
    },
    json() {},
  };
  await module.default(
    { method: "POST", body: { path } } as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  return { status, events: module.events };
}
void test("successful root refresh invalidates the shared header and public chat shell", async () => {
  assert.deepEqual(await refresh("/studio"), {
    status: 200,
    events: ["/studio", "header", "chat"],
  });
});
void test("refreshing another page leaves the unrelated header and chat cache intact", async () => {
  assert.deepEqual(await refresh("/beluga"), {
    status: 200,
    events: ["/beluga"],
  });
});
void test("page failure does not invalidate caches and header invalidation failure is not reported as success", async () => {
  assert.deepEqual(await refresh("/studio", "page"), {
    status: 500,
    events: ["/studio"],
  });
  assert.deepEqual(await refresh("/studio", "header"), {
    status: 500,
    events: ["/studio", "header"],
  });
});
