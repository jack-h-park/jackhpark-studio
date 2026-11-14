import assert from "node:assert/strict";
import test from "node:test";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";

async function refresh(
  path: string,
  failure = "",
  inspect?: (evidence: { audits: unknown[]; payload: unknown }) => void,
) {
  const result = await build({
    entryPoints: ["pages/api/admin/revalidate-public-page.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: { js: "const events = []; const audits = [];" },
    footer: { js: "export {events,audits};" },
    plugins: [
      {
        name: "external-boundaries",
        setup(b) {
          const modules: Record<string, string> = {
            "@/lib/get-site-map": `export async function getSiteMap() { ${failure === "resolve_target" ? "throw Error('SECRET_SENTINEL');" : ""} return {canonicalPageMap:{beluga:'fixture'}}; }`,
            "@/lib/server/admin-auth":
              "export async function requireAdminApiAccess(){return {actorEmail:'admin@example.test',requestId:'fixture-request'};} export function requireSameOriginMutation(){return true;} export function auditAdminMutation(input){audits.push(input);}",
            "@/lib/server/notion-header-error":
              "export class NotionHeaderCacheError extends Error{constructor(code){super(code);this.code=code;}}",
            "@/lib/server/notion-header": `import {NotionHeaderCacheError} from '@/lib/server/notion-header-error'; export async function invalidateNotionNavigationHeader(){ events.push('header'); ${failure === "header" ? "throw Error('SECRET_SENTINEL');" : failure.startsWith("header:") ? `throw new NotionHeaderCacheError('${failure.slice(7)}');` : ""} }`,
            "@/lib/server/public-chat-cache": `export async function invalidatePublicChatShell(){events.push('chat');${failure === "chat" ? "throw Error('SECRET_SENTINEL');" : ""}return 'invalidated';}`,
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
    audits: unknown[];
  };
  let status = 200;
  let payload: unknown;
  const res = {
    revalidate: async (target: string) => {
      module.events.push(target);
      if (failure === "page") throw new Error("SECRET_SENTINEL");
    },
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
    },
  };
  await module.default(
    { method: "POST", body: { path } } as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  inspect?.({ audits: module.audits, payload });
  return { status, events: module.events };
}
void test("successful root refresh invalidates the shared header and public chat shell", async () => {
  assert.deepEqual(await refresh("/studio"), {
    status: 200,
    events: ["/studio", "header", "chat"],
  });
});

for (const [failure, stage, pageRevalidated] of [
  ["resolve_target", "resolve_target", false],
  ["page", "page_revalidation", false],
  ["header", "header_invalidation", true],
  ["chat", "chat_invalidation", true],
] as const) {
  void test(`${stage} failure records the exact stage and partial completion without raw exception data`, async () => {
    const result = await refresh("/studio", failure, ({ audits, payload }) => {
      const audit = audits[0] as { failure?: unknown };
      assert.deepEqual(audit.failure, {
        stage,
        code: "operation_failed",
        pageRevalidated,
      });
      assert.deepEqual(payload, {
        error: "Unable to refresh the public page.",
        requestId: "fixture-request",
      });
      assert.ok(
        !JSON.stringify({ audits, payload }).includes("SECRET_SENTINEL"),
      );
    });
    assert.equal(result.status, 500);
  });
}

for (const code of [
  "purge_context_unavailable",
  "revision_not_retained",
  "invalid_revision",
] as const) {
  void test(`known header failure ${code} remains distinguishable from an opaque dependency failure`, async () => {
    await refresh("/studio", `header:${code}`, ({ audits }) => {
      assert.deepEqual((audits[0] as { failure?: unknown }).failure, {
        stage: "header_invalidation",
        code,
        pageRevalidated: true,
      });
    });
  });
}
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
