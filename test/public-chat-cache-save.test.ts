import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { Socket } from "node:net";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, type ComponentType, createElement } from "react";
import { createRoot } from "react-dom/client";

import { useAdminChatConfig } from "@/hooks/use-admin-chat-config";

import {
  chatConfigFixture,
  runtimeMetaFixture,
} from "./helpers/public-chat-fixtures";

type Fixture = {
  events: string[];
  audited: { result: string; target: string }[];
};

async function notificationPage() {
  const require = createRequire(import.meta.url);
  const result = await build({
    entryPoints: ["components/admin/chat-config/ChatConfigPage.tsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    plugins: [
      {
        name: "unrelated-admin-surfaces",
        setup(pluginBuild) {
          pluginBuild.onResolve(
            { filter: /^(?:react(?:\/jsx-runtime)?$|@react-icons\/)/ },
            (args) => ({
              path: pathToFileURL(require.resolve(args.path)).href,
              external: true,
            }),
          );
          pluginBuild.onResolve({ filter: /\.css$/ }, (args) => ({
            path: args.path,
            namespace: "empty-css",
          }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({
            contents: "export default {};",
            loader: "js",
          }));
          pluginBuild.onResolve(
            { filter: /^@\/components\/admin\// },
            (args) => ({ path: args.path, namespace: "unrelated" }),
          );
          pluginBuild.onLoad(
            { filter: /.*/, namespace: "unrelated" },
            (args) => {
              const name = args.path.split("/").at(-1)!;
              let contents = `export function ${name}() { return null; }`;
              if (name === "AdminPageShell")
                contents =
                  "import {createElement} from 'react'; export function AdminPageShell({children,header}) { return createElement('div',null,header.actions,children); }";
              if (name === "ChatConfigHelpers")
                contents =
                  "export function ChatConfigSection({children}) {return children;} export function CollapsibleSection({children}) {return children;}";
              if (name === "CoreBehaviorCard")
                contents = `import {createElement} from 'react'; export function CoreBehaviorCard({updateConfig}) {return createElement('button', {onClick:()=>updateConfig(prev=>({...prev,baseSystemPromptSummary:'Edited'}))}, 'Edit fixture');}`;
              return { contents, loader: "js" };
            },
          );
        },
      },
    ],
  });
  return (await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  )) as {
    ChatConfigPage: ComponentType<{
      adminConfig: ReturnType<typeof chatConfigFixture>;
      runtimeMeta: ReturnType<typeof runtimeMetaFixture>;
      lastUpdatedAt: null;
      pageTitle: string;
    }>;
  };
}
async function bundled(entry: string, mode = "success") {
  const modules: Record<string, string> = {
    "@/lib/server/admin-auth": `
      export async function requireAdminApiAccess(req,res) {
        if (${JSON.stringify(mode)} === 'denied-auth') {res.status(401).json({error:'Authentication required.'}); return null;}
        return {actorEmail:'admin@example.test',requestId:'fixture-request'};
      }
      export function requireSameOriginMutation(req,res) {
        if (${JSON.stringify(mode)} === 'denied-origin') {res.status(403).json({error:'Cross-origin mutation rejected.'}); return false;}
        return true;
      }
      export function auditAdminMutation(input) { fixture.audited.push(input); }
    `,
    "@/lib/server/admin-chat-config": `export async function saveAdminChatConfig(config) {
      fixture.events.push('save');
      if (${JSON.stringify(mode)} === 'db-failed') throw new Error('DB save failed');
      fixture.events.push('committed'); return {updatedAt:'2026-10-02T12:00:00.000Z'};
    }`,
    "@vercel/functions": `export async function invalidateByTag(tag) {
      fixture.events.push('invalidate:'+tag);
      if (${JSON.stringify(mode)} === 'purge-failed') throw new Error('PRIVATE_PROVIDER_TOKEN');
    }`,
  };
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: { js: "const fixture = { events: [], audited: [] };" },
    footer: { js: "export { fixture };" },
    plugins: [
      {
        name: "external-boundaries",
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /.*/ }, (args) =>
            modules[args.path]
              ? { path: args.path, namespace: "fixture" }
              : undefined,
          );
          pluginBuild.onLoad(
            { filter: /.*/, namespace: "fixture" },
            (args) => ({ contents: modules[args.path], loader: "js" }),
          );
        },
      },
    ],
  });
  return (await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${mode}`).toString("base64")}`
  )) as {
    default: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;
    invalidatePublicChatShell: () => Promise<string>;
    fixture: Fixture;
  };
}

async function save(
  mode: string,
  method = "POST",
  body: unknown = chatConfigFixture(),
) {
  const module = await bundled("pages/api/admin/chat-config.ts", mode);
  module.fixture.events.length = 0;
  module.fixture.audited.length = 0;
  const req = new IncomingMessage(new Socket()) as NextApiRequest;
  req.method = method;
  req.body = body;
  let status = 200;
  let payload: Record<string, unknown> = {};
  const res = new ServerResponse(req) as unknown as NextApiResponse;
  res.status = (code) => {
    status = code;
    return res;
  };
  res.json = (value: Record<string, unknown>) => {
    payload = value;
    return res;
  };
  const previousVercel = process.env.VERCEL;
  const previousEnv = process.env.VERCEL_ENV;
  if (mode === "local") delete process.env.VERCEL;
  else process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  try {
    await module.default(req, res);
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
  }
  return { status, payload, ...module.fixture, res };
}

void test("successful save invalidates only the chat tag after DB commit", async () => {
  const result = await save("success");
  assert.equal(result.status, 200);
  assert.deepEqual(result.events, [
    "save",
    "committed",
    "invalidate:public-chat-shell-v1",
  ]);
  assert.deepEqual(result.payload, {
    updatedAt: "2026-10-02T12:00:00.000Z",
    cacheRefresh: "invalidated",
  });
  assert.deepEqual(
    result.audited.map(({ result, target }) => ({ result, target })),
    [{ result: "success", target: "chat-config" }],
  );
});

for (const [mode, expectedStatus] of [
  ["denied-auth", 401],
  ["denied-origin", 403],
  ["db-failed", 500],
] as const) {
  void test(`${mode} never invalidates`, async () => {
    const result = await save(mode);
    assert.equal(result.status, expectedStatus);
    assert.deepEqual(result.events, mode === "db-failed" ? ["save"] : []);
    assert.equal(result.payload.cacheRefresh, undefined);
  });
}

void test("method and invalid payload rejections never save or invalidate", async () => {
  const method = await save("success", "GET");
  assert.equal(method.status, 405);
  assert.deepEqual(method.res.getHeader("Allow"), ["POST"]);
  assert.deepEqual(method.events, []);
  const payload = await save("success", "POST", null);
  assert.equal(payload.status, 400);
  assert.deepEqual(payload.events, []);
});

void test("purge rejection reports saved timestamp with safe warning and successful save audit", async () => {
  const result = await save("purge-failed");
  assert.equal(result.status, 200);
  assert.equal(result.payload.updatedAt, "2026-10-02T12:00:00.000Z");
  assert.equal(result.payload.cacheRefresh, "failed");
  assert.equal(result.payload.error, undefined);
  assert.match(String(result.payload.warning), /saved.*cache refresh/i);
  assert.equal(
    JSON.stringify(result.payload).includes("PRIVATE_PROVIDER_TOKEN"),
    false,
  );
  assert.deepEqual(
    result.audited.map(({ result, target }) => ({ result, target })),
    [
      { result: "success", target: "chat-config" },
      { result: "failure", target: "public-chat-shell-cache" },
    ],
  );
});

void test("local save explicitly skips SDK invalidation", async () => {
  const module = await bundled("lib/server/public-chat-cache.ts");
  const previousVercel = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    assert.equal(await module.invalidatePublicChatShell(), "skipped-local");
    assert.deepEqual(module.fixture.events, []);
  } finally {
    if (previousVercel !== undefined) process.env.VERCEL = previousVercel;
  }
});

void test("successful local API save returns skipped-local alongside its committed timestamp", async () => {
  const result = await save("local");
  assert.equal(result.status, 200);
  assert.deepEqual(result.events, ["save", "committed"]);
  assert.deepEqual(result.payload, {
    updatedAt: "2026-10-02T12:00:00.000Z",
    cacheRefresh: "skipped-local",
  });
});

void test("saved-but-refresh-failed fixture keeps form saved and displays warning rather than error", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "https://example.test/admin/chat-config" },
  );
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  const config = chatConfigFixture();
  const runtimeMeta = runtimeMetaFixture();
  let state: ReturnType<typeof useAdminChatConfig>;
  function Harness() {
    state = useAdminChatConfig({
      adminConfig: config,
      lastUpdatedAt: null,
      runtimeMeta,
    });
    return createElement(
      "div",
      null,
      createElement("span", { role: "status" }, state.cacheRefreshWarning),
      createElement("span", { role: "alert" }, state.errorMessage),
    );
  }
  globalThis.fetch = async () =>
    Response.json(
      {
        updatedAt: "2026-10-02T12:00:00.000Z",
        cacheRefresh: "failed",
        warning: "Settings saved, but the public chat cache refresh failed.",
      },
      { status: 200 },
    );
  globalThis.setTimeout = ((callback: () => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () =>
      state.updateConfig((prev) => ({
        ...prev,
        baseSystemPromptSummary: "Edited",
      })),
    );
    await act(async () => state.handleSave());
    assert.equal(state!.hasUnsavedChanges, false);
    assert.equal(state!.lastSavedAt, "2026-10-02T12:00:00.000Z");
    assert.equal(state!.errorMessage, null);
    assert.match(
      dom.window.document.querySelector('[role="status"]')!.textContent!,
      /Settings saved.*cache refresh failed/,
    );
    assert.equal(
      dom.window.document.querySelector('[role="alert"]')!.textContent,
      "",
    );
    await act(async () =>
      state.updateConfig((prev) => ({
        ...prev,
        baseSystemPromptSummary: "Unsaved edit",
      })),
    );
    globalThis.fetch = async () =>
      Response.json({ error: "Database save failed" }, {
        status: 500,
      });
    await act(async () => state.handleSave());
    assert.equal(state!.hasUnsavedChanges, true);
    assert.equal(state!.cacheRefreshWarning, null);
    assert.equal(state!.saveStatus, "error");
    assert.equal(state!.errorMessage, "Database save failed");
    assert.equal(state!.lastSavedAt, "2026-10-02T12:00:00.000Z");
    globalThis.fetch = async () =>
      Response.json(
        {
          updatedAt: "2026-10-02T13:00:00.000Z",
          cacheRefresh: "invalidated",
        },
        { status: 200 },
      );
    await act(async () => state.handleSave());
    assert.equal(state!.hasUnsavedChanges, false);
    assert.equal(state!.cacheRefreshWarning, null);
    assert.equal(state!.errorMessage, null);
    assert.equal(state!.lastSavedAt, "2026-10-02T13:00:00.000Z");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
    for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
      if (descriptors[key])
        Object.defineProperty(globalThis, key, descriptors[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});

void test("existing admin save notification renders the persisted warning after saving", async () => {
  const { ChatConfigPage } = await notificationPage();
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "https://example.test/admin/chat-config" },
  );
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  globalThis.fetch = async () =>
    Response.json(
      {
        updatedAt: "2026-10-02T12:00:00.000Z",
        cacheRefresh: "failed",
        warning: "Settings saved, but the public chat cache refresh failed.",
      },
      { status: 200 },
    );
  globalThis.setTimeout = ((callback: () => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () =>
      root.render(
        createElement(ChatConfigPage, {
          adminConfig: chatConfigFixture(),
          runtimeMeta: runtimeMetaFixture(),
          lastUpdatedAt: null,
          pageTitle: "Chat Configuration",
        }),
      ),
    );
    const buttons = () => [...dom.window.document.querySelectorAll("button")];
    await act(async () =>
      buttons()
        .find((button) => button.textContent === "Edit fixture")!
        .click(),
    );
    await act(async () =>
      buttons()
        .find((button) => button.textContent === "Save")!
        .click(),
    );
    assert.match(
      dom.window.document.querySelector('[role="status"]')!.textContent!,
      /Settings saved.*cache refresh failed/,
    );
    assert.match(dom.window.document.body.textContent!, /All changes saved/);
    assert.match(dom.window.document.body.textContent!, /Last saved/);
    assert.equal(
      buttons().find((button) => button.textContent === "Save")!.disabled,
      true,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
    for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
      if (descriptors[key])
        Object.defineProperty(globalThis, key, descriptors[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
