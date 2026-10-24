import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { Socket } from "node:net";
import test from "node:test";
import { runInThisContext } from "node:vm";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
type Bundle = {
  chat: Handler;
  legacy: Handler;
  fixture: {
    reads: number;
    fail: boolean;
    configs: unknown[];
    dispatches: number;
  };
};

async function handlers(): Promise<Bundle> {
  const result = await build({
    stdin: {
      contents:
        'export {default as chat} from "./pages/api/chat"; export {default as legacy} from "./pages/api/langchain_chat";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    packages: "external",
    format: "cjs",
    banner: {
      js: "const fixture = {reads: 0, fail: false, configs: [], dispatches: 0};",
    },
    footer: { js: "module.exports.fixture = fixture;" },
    plugins: [
      {
        name: "chat-external-boundaries",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/server\/chat-settings$/ }, () => ({
            path: "settings",
            namespace: "fixture",
          }));
          b.onResolve({ filter: /langchain_chat_entry$/ }, () => ({
            path: "entry",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            loader: "js",
            contents:
              path === "settings"
                ? `export async function loadChatModelSettings(options) {
                fixture.reads++; fixture.configs.push(options.sessionConfig);
                if (fixture.fail) throw new Error('Settings unavailable');
                return {
                  engine: 'lc', llmModelId: 'fixture-llm', requestedLlmModelId: 'fixture-llm',
                  resolvedLlmModelId: 'fixture-llm', llmModelWasSubstituted: false,
                  llmSubstitutionReason: undefined, embeddingModelId: 'fixture-embedding',
                  embeddingSpaceId: 'fixture-space', embeddingResolutionSnapshot: {
                    resolvedProvider: 'openai', resolvedModel: 'fixture-embedding',
                    resolvedSpaceId: 'fixture-space', reason: 'global_default', source: 'defaults',
                  },
                  llmProvider: 'openai', embeddingProvider: 'openai', llmModel: 'fixture-llm',
                  embeddingModel: 'fixture-embedding', embeddingSpaceWarnings: undefined,
                  reverseRagEnabled: false, reverseRagMode: 'precision', hydeEnabled: false,
                  rankerMode: 'none', isDefault: {
                    engine: true, llmProvider: true, embeddingProvider: true, llmModel: true,
                    embeddingModel: true, reverseRagEnabled: true, reverseRagMode: true,
                    hydeEnabled: true, rankerMode: true, embeddingSpaceId: true,
                  },
                  llmEngine: 'unknown', policy: {requireLocal: false}, wantsLocalEngine: false,
                  enforcement: 'cloud_ok', localBackendAvailable: false, localLlmBackendEnv: null,
                  isLocal: false, fallbackFrom: undefined, safeMode: false,
                };
              }`
                : `export async function handleLangchainChatEntry(req, res) {
                fixture.dispatches++;
                res.status(200).json({ok: true, engine: req.chatRuntime?.engine ?? null, body: req.body});
              }`,
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  const execute = runInThisContext(
    `(function(require, module, exports) {${result.outputFiles[0].text}\n})`,
  ) as (
    require: NodeJS.Require,
    module: { exports: unknown },
    exports: unknown,
  ) => void;
  execute(createRequire(import.meta.url), module, module.exports);
  return module.exports as Bundle;
}

function response(method: string, body: unknown) {
  const req = new IncomingMessage(new Socket()) as NextApiRequest;
  req.method = method;
  req.body = body;
  let payload: unknown;
  const res = new ServerResponse(req) as unknown as NextApiResponse;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value: unknown) => {
    payload = value;
    res.end();
    return res;
  };
  return { req, res, body: () => payload };
}

// Moving settings resolution ahead of validation must fail these route-level checks.
void test("both chat routes reject unsupported methods before unavailable settings", async () => {
  const module = await handlers();
  module.fixture.fail = true;
  for (const handler of [module.chat, module.legacy]) {
    const r = response("GET", { messages: [{ role: "user", content: "Hi" }] });
    await handler(r.req, r.res);
    assert.equal(r.res.statusCode, 405);
    assert.equal(r.res.getHeader("Allow"), "POST");
    assert.deepEqual(r.body(), { error: "Method Not Allowed" });
  }
  assert.equal(module.fixture.reads, 0);
  assert.equal(module.fixture.dispatches, 0);
});

void test("both chat routes reject malformed or empty messages before unavailable settings", async () => {
  const module = await handlers();
  module.fixture.fail = true;
  for (const handler of [module.chat, module.legacy]) {
    for (const body of [
      undefined,
      null,
      "{",
      "null",
      "42",
      {},
      [],
      { messages: [] },
      { messages: "Hi" },
      '{"messages":[]}',
    ]) {
      const r = response("POST", body);
      await handler(r.req, r.res);
      assert.equal(r.res.statusCode, 400, `body: ${JSON.stringify(body)}`);
      assert.deepEqual(r.body(), {
        error: "messages array with at least one entry is required",
      });
    }
  }
  assert.equal(module.fixture.reads, 0);
  assert.equal(module.fixture.dispatches, 0);
});

void test("valid object and JSON bodies preserve dispatch and session configuration", async (t) => {
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key";
  const module = await handlers();
  const body = {
    messages: [{ role: "user", content: "Hi" }],
    config: { temperature: 0.3 },
  };
  for (const handler of [module.chat, module.legacy]) {
    for (const input of [body, JSON.stringify(body)]) {
      const r = response("POST", input);
      await handler(r.req, r.res);
      assert.equal(r.res.statusCode, 200);
      assert.deepEqual(r.body(), {
        ok: true,
        engine: handler === module.chat ? "lc" : null,
        body,
      });
    }
  }
  assert.deepEqual(module.fixture.configs, [
    { temperature: 0.3 },
    { temperature: 0.3 },
  ]);
  assert.equal(module.fixture.reads, 2);
  assert.equal(module.fixture.dispatches, 4);
});
