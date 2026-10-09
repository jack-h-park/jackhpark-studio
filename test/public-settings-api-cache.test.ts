import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import test from "node:test";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
type Bundle = {
  config: Handler;
  runtime: Handler;
  fixture: { reads: number; fail: boolean; version: number };
};

async function handlers(): Promise<Bundle> {
  const result = await build({
    stdin: {
      contents:
        'export {default as config} from "./pages/api/chat-config"; export {default as runtime} from "./pages/api/chat-runtime";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: { js: "const fixture = {reads: 0, fail: false, version: 1};" },
    footer: { js: "export {fixture};" },
    plugins: [
      {
        name: "external-settings-boundary",
        setup(b) {
          b.onResolve(
            { filter: /^(?:@\/lib\/server\/|\.\/)chat-settings$/ },
            () => ({ path: "settings", namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents: `export async function loadChatModelSettings(options) {
          if (options.forceRefresh !== true) throw new Error('Origin must read current persisted settings');
          fixture.reads++; const version=fixture.version;
          await new Promise(resolve=>setTimeout(resolve,10));
          if(fixture.fail) throw new Error('Fixture settings unavailable');
          return {version};
        }`,
          }));
          b.onResolve({ filter: /^@vercel\/functions$/ }, () => ({
            path: "vercel",
            namespace: "sdk",
          }));
          b.onLoad({ filter: /.*/, namespace: "sdk" }, () => ({
            contents: "export async function invalidateByTag() {}",
            loader: "js",
          }));
        },
      },
    ],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${Math.random()}`).toString("base64")}`
  ) as Promise<Bundle>;
}

function response(method = "GET", headers: Record<string, string> = {}) {
  const req = new IncomingMessage(new Socket()) as NextApiRequest;
  req.method = method;
  req.headers = headers;
  let payload: unknown;
  const res = new ServerResponse(req) as unknown as NextApiResponse;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    payload = body;
    return res;
  };
  return { req, res, body: () => payload };
}

void test("public settings success preserves both envelopes and a short tagged CDN lifetime", async () => {
  const module = await handlers();
  for (const [handler, key] of [
    [module.config, "models"],
    [module.runtime, "runtime"],
  ] as const) {
    const r = response();
    await handler(r.req, r.res);
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(r.body(), { [key]: { version: 1 } });
    assert.equal(
      r.res.getHeader("Cache-Control"),
      "public, max-age=0, s-maxage=60",
    );
    assert.equal(r.res.getHeader("Vercel-Cache-Tag"), "public-chat-shell-v1");
  }
});

void test("overlapping API origin reads coalesce but a later origin read observes a changed version", async () => {
  const module = await handlers();
  const a = response(),
    b = response();
  await Promise.all([
    module.config(a.req, a.res),
    module.runtime(b.req, b.res),
  ]);
  assert.equal(module.fixture.reads, 1);
  module.fixture.version = 2;
  const c = response();
  await module.config(c.req, c.res);
  assert.deepEqual(c.body(), { models: { version: 2 } });
  assert.equal(module.fixture.reads, 2);
});

void test("errors never become cacheable and a later origin read recovers", async () => {
  const module = await handlers();
  module.fixture.fail = true;
  const a = response();
  await module.config(a.req, a.res);
  assert.equal(a.res.statusCode, 500);
  assert.equal(a.res.getHeader("Cache-Control"), "private, no-store");
  assert.equal(a.res.getHeader("Vercel-Cache-Tag"), undefined);
  module.fixture.fail = false;
  const b = response();
  await module.config(b.req, b.res);
  assert.equal(b.res.statusCode, 200);
});

void test("unsupported methods and authorization requests cannot share public cached responses", async () => {
  const module = await handlers();
  const bad = response("POST");
  await module.runtime(bad.req, bad.res);
  assert.equal(bad.res.statusCode, 405);
  assert.equal(module.fixture.reads, 0);
  const auth = response("GET", { authorization: "Bearer fixture" });
  await module.runtime(auth.req, auth.res);
  assert.equal(auth.res.getHeader("Cache-Control"), "private, no-store");
  assert.equal(auth.res.getHeader("Vercel-Cache-Tag"), undefined);
});

void test("query and Set-Cookie responses never enter the shared public cache", async () => {
  const module = await handlers();
  const query = response();
  query.req.query = { refresh: "true" };
  const cookie = response();
  cookie.res.setHeader("Set-Cookie", "fixture=1; HttpOnly");
  for (const r of [query, cookie]) {
    await module.config(r.req, r.res);
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.res.getHeader("Cache-Control"), "private, no-store");
    assert.equal(r.res.getHeader("Vercel-Cache-Tag"), undefined);
  }
});
