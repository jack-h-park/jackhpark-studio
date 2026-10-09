import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

// This is a CI build harness, never an application fixture mode. Production
// keeps the ordinary build command and the real post-deploy sitemap sweep.
if (process.env.CI !== "true" || process.env.VERCEL) {
  throw new Error(
    "The Notion fixture build is CI-only and forbidden on Vercel",
  );
}

const childId = "11111111-1111-4111-8111-111111111111";
const buildId = `ci-fixture-${randomUUID()}`;
let unsupportedRequests = 0;
const server = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body || "{}");
    if (
      req.method !== "POST" ||
      req.url !== "/api/v3/loadPageChunk" ||
      typeof input.pageId !== "string" ||
      !/^[\da-f-]{36}$/i.test(input.pageId)
    ) {
      unsupportedRequests++;
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unsupported CI fixture operation" }));
      return;
    }
    const pageId = input.pageId;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        cursor: { stack: [] },
        recordMap: {
          block: {
            [pageId]: {
              role: "reader",
              value: {
                id: pageId,
                type: "page",
                alive: true,
                parent_table: "space",
                parent_id: "22222222-2222-4222-8222-222222222222",
                properties: { title: [["CI fixture page"]] },
                content: [childId],
                created_time: 0,
                last_edited_time: 0,
              },
            },
            [childId]: {
              role: "reader",
              value: {
                id: childId,
                type: "text",
                alive: true,
                parent_table: "block",
                parent_id: pageId,
                properties: {
                  title: [
                    ["Deterministic CI content; never deploy this build."],
                  ],
                },
              },
            },
          },
          collection: {},
          collection_view: {},
          notion_user: {},
        },
      }),
    );
  } catch {
    unsupportedRequests++;
    res.writeHead(400);
    res.end();
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("No fixture port");

const [command = "pnpm", ...args] = process.argv.slice(2);
const child = spawn(command, args.length ? args : ["build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    // Prevent an existing local or restored sitemap from hiding fixture calls.
    VERCEL_DEPLOYMENT_ID: buildId,
    NOTION_API_BASE_URL: `http://127.0.0.1:${address.port}/api/v3`,
  },
});

// Cancellation must not leave a build process or fixture listener behind.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (unsupportedRequests) process.exitCode = process.exitCode || 1;
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  // A subsequent ordinary local build must crawl live data, not reuse this
  // fixture within the five-minute local sitemap TTL. Runtime smoke can still
  // consume the fixture artifact; CI never publishes it as a deployment.
  const cachePath = ".next/cache/notion-sitemap.json";
  try {
    const entry = JSON.parse(readFileSync(cachePath, "utf8"));
    if (entry.buildId === buildId) {
      writeFileSync(cachePath, JSON.stringify({ ...entry, ts: 0 }));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
