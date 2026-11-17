import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { PublicSiteRefreshPanel } from "@/components/admin/ingestion/PublicSiteRefreshPanel";

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
              "export class NotionHeaderCacheError extends Error{constructor(code){super(code);this.code=code;if(code==='revision_not_retained')this.verification={attempts:3,missing:3,previous:0,different:0,invalid:0,waitedMs:350,store:{backend:'request-context',invalidation:'runtime-expire-tag'}};}}",
            "@/lib/server/notion-header": `import {NotionHeaderCacheError} from '@/lib/server/notion-header-error'; export async function invalidateNotionNavigationHeader(){ events.push('header'); ${failure === "header" ? "throw Error('SECRET_SENTINEL');" : failure.startsWith("header:") ? `throw new NotionHeaderCacheError('${failure.slice(7)}');` : ""} return ${failure === "delayed_success" ? "{attempts:2,missing:1,previous:0,different:0,invalid:0,waitedMs:100,store:{backend:'request-context',invalidation:'runtime-expire-tag'}}" : "undefined"}; }`,
            "@/lib/server/public-chat-cache": `import {NotionHeaderCacheError} from '@/lib/server/notion-header-error'; export async function invalidatePublicChatShell(){events.push('chat');${failure === "chat" ? "throw Error('SECRET_SENTINEL');" : failure === "chat-context" ? "throw new NotionHeaderCacheError('purge_context_unavailable');" : ""}return 'invalidation-requested';}`,
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

void test("root refresh records a requested CDN operation rather than completed propagation", async () => {
  await refresh("/studio", "", ({ audits }) => {
    assert.equal(
      (audits[0] as { cacheInvalidation?: unknown }).cacheInvalidation,
      "invalidation-requested",
    );
  });
});

void test("unavailable CDN purge preserves partial completion and never retries", async () => {
  const result = await refresh(
    "/studio",
    "chat-context",
    ({ audits, payload }) => {
      assert.deepEqual((audits[0] as { failure?: unknown }).failure, {
        stage: "chat_invalidation",
        code: "purge_context_unavailable",
        pageRevalidated: true,
      });
      assert.equal(JSON.stringify(payload).includes("purge_context"), false);
    },
  );
  assert.equal(result.status, 500);
  assert.deepEqual(result.events, ["/studio", "header", "chat"]);
});

for (const failure of ["header", "chat-context"] as const) {
  void test(`${failure} failure reports only confirmed completed work and a retry caution`, async () => {
    const result = await refresh("/studio", failure, ({ payload }) => {
      const response = payload as { error: string; requestId: string };
      assert.match(response.error, /page.*refresh completed/i);
      assert.match(response.error, /not confirmed/i);
      assert.match(response.error, /check.*diagnostics before trying again/i);
      if (failure === "chat-context") {
        assert.match(response.error, /shared navigation refresh completed/i);
        assert.match(
          response.error,
          /public chat cache refresh was not confirmed/i,
        );
      } else {
        assert.match(response.error, /shared navigation.*not confirmed/i);
        assert.doesNotMatch(
          response.error,
          /shared navigation refresh completed/i,
        );
      }
      assert.equal(response.requestId, "fixture-request");
      assert.equal(JSON.stringify(payload).includes("SECRET_SENTINEL"), false);
    });
    assert.equal(result.status, 500);
  });

  void test(`${failure} partial completion reaches the real panel after one click without an automatic retry`, async () => {
    const dom = new JSDOM("<div id='root'></div>", {
      url: "https://example.test/admin/ingestion",
    });
    const globals = Object.getOwnPropertyDescriptors(globalThis);
    const originalFetch = globalThis.fetch;
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: dom.window },
      document: { configurable: true, value: dom.window.document },
      IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    });
    let calls = 0;
    let respond!: (response: Response) => void;
    globalThis.fetch = async (input, init) => {
      calls++;
      assert.equal(input, "/api/admin/revalidate-public-page");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { path: "/studio" });
      return new Promise<Response>((resolve) => {
        respond = resolve;
      });
    };
    const host = dom.window.document.getElementById("root")!;
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(PublicSiteRefreshPanel)));
      const button = host.querySelector("button")!;
      await act(async () => {
        button.click();
        await setImmediate();
      });
      assert.equal(calls, 1);
      assert.equal(button.disabled, true);
      button.click();
      assert.equal(calls, 1);

      let payload: unknown;
      const result = await refresh("/studio", failure, (evidence) => {
        payload = evidence.payload;
      });
      await act(async () => {
        respond(Response.json(payload, { status: result.status }));
        await setImmediate();
      });
      const message = host.querySelector('[role="status"]')?.textContent ?? "";
      assert.match(message, /page.*refresh completed/i);
      assert.match(message, /diagnostics before trying again/i);
      assert.doesNotMatch(
        host.textContent ?? "",
        /SECRET_SENTINEL|purge_context_unavailable/,
      );
      assert.deepEqual(
        result.events,
        failure === "header"
          ? ["/studio", "header"]
          : ["/studio", "header", "chat"],
      );
      assert.equal(button.disabled, false);
      await act(async () => {
        await setImmediate();
      });
      assert.equal(calls, 1);
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = originalFetch;
      for (const name of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
        if (globals[name])
          Object.defineProperty(globalThis, name, globals[name]);
        else Reflect.deleteProperty(globalThis, name);
      }
      dom.window.close();
    }
  });
}

void test("a recovered delayed write records bounded verification evidence on successful refresh", async () => {
  const result = await refresh("/studio", "delayed_success", ({ audits }) => {
    assert.deepEqual(
      (audits[0] as { cacheVerification?: unknown }).cacheVerification,
      {
        attempts: 2,
        missing: 1,
        previous: 0,
        different: 0,
        invalid: 0,
        waitedMs: 100,
        store: {
          backend: "request-context",
          invalidation: "runtime-expire-tag",
        },
      },
    );
  });
  assert.equal(result.status, 200);
});

void test("unverified missing reads remain an explicitly ambiguous failure in audit evidence", async () => {
  const result = await refresh(
    "/studio",
    "header:revision_not_retained",
    ({ audits }) => {
      assert.deepEqual(
        (audits[0] as { cacheVerification?: unknown }).cacheVerification,
        {
          attempts: 3,
          missing: 3,
          previous: 0,
          different: 0,
          invalid: 0,
          waitedMs: 350,
          store: {
            backend: "request-context",
            invalidation: "runtime-expire-tag",
          },
        },
      );
    },
  );
  assert.equal(result.status, 500);
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
      const response = payload as { error: string; requestId: string };
      assert.equal(response.requestId, "fixture-request");
      if (pageRevalidated)
        assert.match(
          response.error,
          /refresh completed.*not confirmed.*diagnostics before trying again/i,
        );
      else assert.equal(response.error, "Unable to refresh the public page.");
      assert.ok(
        !JSON.stringify({ audits, payload }).includes("SECRET_SENTINEL"),
      );
    });
    assert.equal(result.status, 500);
  });
}

for (const code of [
  "purge_context_unavailable",
  "runtime_cache_context_unavailable",
  "purge_failed",
  "revision_write_failed",
  "revision_read_failed",
  "revision_changed",
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
