import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { Socket } from "node:net";
import test from "node:test";
import { runInThisContext } from "node:vm";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";

void test("the real chat rejection path works without loading database or tracing SDKs", async () => {
  const bundle = await build({
    entryPoints: ["pages/api/chat.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    logLevel: "silent",
  });
  const realRequire = createRequire(import.meta.url);
  const guardedRequire = (id: string): unknown => {
    assert.ok(
      !/^@(?:supabase|langfuse|opentelemetry)\//.test(id),
      `Rejected chat requests must not initialize SDK ${id}`,
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
  const handler = (
    module.exports as {
      default: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;
    }
  ).default;
  for (const [method, body, expected] of [
    ["GET", undefined, 405],
    ["POST", { messages: [] }, 400],
    ["POST", "{", 400],
  ] as const) {
    const req = new IncomingMessage(new Socket()) as NextApiRequest;
    req.method = method;
    req.body = body;
    const res = new ServerResponse(req) as unknown as NextApiResponse;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = () => res;
    await handler(req, res);
    assert.equal(res.statusCode, expected);
  }
});
