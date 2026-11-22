import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function withOrigin(
  verify: (
    run: (script: string) => ReturnType<typeof exec>,
    requests: string[],
  ) => Promise<void>,
  options: { invalidRuntime?: boolean; badAllow?: boolean } = {},
) {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    switch (req.url) {
      case "/api/chat":
        res.writeHead(405, { Allow: options.badAllow ? "GET" : "POST" });
        return res.end();
      case "/api/chat-config":
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ models: { engine: "lc" } }));
      case "/api/chat-runtime":
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify(
            options.invalidRuntime ? {} : { runtime: { engine: "lc" } },
          ),
        );
      case "/assets/avatar-favicon/error.png":
        res.setHeader("Content-Type", "image/png");
        return res.end();
      default:
        return res.end("<title>Ask JackGPT</title>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await verify(
      (script) =>
        exec(process.execPath, [`scripts/smoke/${script}.mjs`], {
          env: {
            ...process.env,
            PROD_BASE_URL: `http://127.0.0.1:${address.port}`,
            SMOKE_SCOPE: "core",
          },
          timeout: 5000,
        }),
      requests,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

void test("recurring production smoke keeps the browser runtime API as its only API probe", async () => {
  await withOrigin(async (run, requests) => {
    await run("prod-availability");
    assert.deepEqual(
      requests.filter((request) => request.includes(" /api/")),
      ["GET /api/chat-runtime"],
    );
    assert.equal(requests.length, 10);
  });
});

void test("recurring smoke rejects a successful JSON response missing its runtime", async () => {
  await withOrigin(
    async (run) => {
      await assert.rejects(run("prod-availability"), {
        code: 1,
        stdout: /FAIL \/api\/chat-runtime 200/,
      });
    },
    { invalidRuntime: true },
  );
});

void test("deployment verifies the compatibility API and chat method contract using only GET", async () => {
  await withOrigin(async (run, requests) => {
    await run("deployment-api-availability");
    assert.deepEqual(requests, ["GET /api/chat", "GET /api/chat-config"]);
  });
});

void test("deployment rejects a 405 that does not advertise POST", async () => {
  await withOrigin(
    async (run, requests) => {
      await assert.rejects(run("deployment-api-availability"), {
        code: 1,
        stdout: /FAIL \/api\/chat 405/,
      });
      assert.ok(requests.includes("GET /api/chat-config"));
    },
    { badAllow: true },
  );
});
