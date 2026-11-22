import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import test from "node:test";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";

async function bundle() {
  const result = await build({
    stdin: {
      contents: 'export {default as handler} from "./pages/api/notion";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: { js: 'const fixture = {reads:0, mode:"ok", lastId:null};' },
    footer: { js: "export {fixture};" },
    plugins: [
      {
        name: "notion-network-boundary",
        setup(b) {
          b.onResolve(
            { filter: /^@\/lib\/(config|resolve-notion-page)$/ },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            loader: "js",
            contents: args.path.endsWith("config")
              ? 'export const domain="example.com";'
              : `export async function resolveNotionPage(domain,id) {
        fixture.reads++; fixture.lastId=id;
        if(fixture.mode==='throw') throw new Error('unavailable');
        if(fixture.mode==='error') return {error:{statusCode:404,code:'UNKNOWN_ROUTE'}};
        if(fixture.mode==='empty') return {};
        return {pageId:id, recordMap:{block:{}},site:{domain}};
      }`,
          }));
        },
      },
    ],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${Math.random()}`).toString("base64")}`
  ) as Promise<{
    handler: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
    fixture: { reads: number; mode: string; lastId: string | null };
  }>;
}
function request(id: unknown = "studio", method = "GET") {
  const req = new IncomingMessage(new Socket()) as NextApiRequest;
  req.method = method;
  req.query = { id } as NextApiRequest["query"];
  let body: unknown;
  const res = new ServerResponse(req) as unknown as NextApiResponse;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    body = value;
    return res;
  };
  return { req, res, body: () => body };
}
void test("normal public Notion GET preserves payload and uses only a short CDN cache", async () => {
  const m = await bundle();
  for (const id of [
    "studio",
    "28399029c0b480e3bb1bfec84fe83407",
    "28399029-c0b4-80e3-bb1b-fec84fe83407",
  ]) {
    const r = request(id);
    await m.handler(r.req, r.res);
    assert.equal(r.res.statusCode, 200);
    assert.equal(m.fixture.lastId, id);
    assert.deepEqual(r.body(), {
      pageId: id,
      recordMap: { block: {} },
      site: { domain: "example.com" },
    });
    assert.equal(
      r.res.getHeader("Cache-Control"),
      "public, max-age=0, s-maxage=60",
    );
  }
});
void test("bad methods and invalid IDs stop before the Notion resolver", async () => {
  const m = await bundle();
  const post = request("studio", "POST");
  await m.handler(post.req, post.res);
  assert.equal(post.res.statusCode, 405);
  assert.equal(post.res.getHeader("Allow"), "GET");
  for (const id of [
    null,
    [],
    ["studio", "other"],
    "",
    "../studio",
    "admin",
    "a".repeat(257),
  ]) {
    const r = request(id);
    await m.handler(r.req, r.res);
    assert.equal(r.res.statusCode, 400);
    assert.equal(r.res.getHeader("Cache-Control"), "private, no-store");
  }
  assert.equal(m.fixture.reads, 0);
});
void test("resolver errors and incomplete payloads never enter public cache; later requests recover", async () => {
  const m = await bundle();
  for (const [mode, status] of [
    ["error", 404],
    ["throw", 404],
    ["empty", 500],
  ] as const) {
    m.fixture.mode = mode;
    const r = request();
    await m.handler(r.req, r.res);
    assert.equal(r.res.statusCode, status);
    assert.equal(r.res.getHeader("Cache-Control"), "private, no-store");
  }
  m.fixture.mode = "ok";
  const r = request();
  await m.handler(r.req, r.res);
  assert.equal(r.res.statusCode, 200);
});
void test("authorization, extra query keys and Set-Cookie cannot share a cached response", async () => {
  const m = await bundle();
  const auth = request(),
    query = request(),
    cookie = request();
  auth.req.headers.authorization = "Bearer fixture";
  query.req.query.refresh = "true";
  cookie.res.setHeader("Set-Cookie", "fixture=1");
  for (const r of [auth, query, cookie]) {
    await m.handler(r.req, r.res);
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.res.getHeader("Cache-Control"), "private, no-store");
  }
});
