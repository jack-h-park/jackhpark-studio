import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const script = path.join(repoRoot, "scripts/smoke/sitemap-availability.mjs");

type Behaviour = {
  /** Number of leading /sitemap.xml requests that should fail with a 500. */
  sitemapColdFailures?: number;
  /** Paths that always 404. */
  dead?: string[];
  /** Paths that fail once, then succeed — a cold page losing a rate-limit race. */
  flaky?: string[];
};

let server: Server;
let port = 0;
let behaviour: Behaviour = {};
let sitemapHits = 0;
const flakyHits = new Map<string, number>();

function sitemapXml(paths: string[]): string {
  const locs = paths
    .map((p) => `<loc>https://www.jackhpark.com${p}</loc>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${locs}</urlset>`;
}

before(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === "/sitemap.xml") {
      sitemapHits += 1;
      if (sitemapHits <= (behaviour.sitemapColdFailures ?? 0)) {
        res.writeHead(500);
        res.end("cold crawl");
        return;
      }
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(
        sitemapXml([
          "/alive",
          ...(behaviour.dead ?? []),
          ...(behaviour.flaky ?? []),
        ]),
      );
      return;
    }

    if (behaviour.dead?.includes(url)) {
      res.writeHead(404);
      res.end("gone");
      return;
    }

    if (behaviour.flaky?.includes(url)) {
      const seen = (flakyHits.get(url) ?? 0) + 1;
      flakyHits.set(url, seen);
      if (seen === 1) {
        res.writeHead(500);
        res.end("cold");
        return;
      }
    }

    res.writeHead(200);
    res.end("ok");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function runSweep(next: Behaviour) {
  behaviour = next;
  sitemapHits = 0;
  flakyHits.clear();

  try {
    const { stdout } = await execFileAsync(process.execPath, [script], {
      env: {
        ...process.env,
        PROD_BASE_URL: `http://127.0.0.1:${port}`,
        // Real delays are seconds; the retry *counts* are what behaviour
        // depends on, so the tests drive them at a few ms.
        SITEMAP_RETRY_DELAY_MS: "5",
        SITEMAP_INDEX_RETRY_DELAY_MS: "5",
      },
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? "" };
  }
}

// The sweep exists to catch pages that 404 while every top-level route stays
// green. It is only worth having if it fails when it should and, just as
// importantly, stays quiet when a cold page merely lost a race.
void describe("sitemap availability sweep", () => {
  void it("passes when every advertised URL serves 200", async () => {
    const { code, stdout } = await runSweep({});
    assert.equal(code, 0);
    assert.match(stdout, /1\/1 URLs served 200/);
  });

  void it("fails on a URL that stays 404", async () => {
    const { code, stdout } = await runSweep({ dead: ["/gone"] });
    assert.equal(code, 1, "a persistently dead page must fail the sweep");
    assert.match(stdout, /FAIL \/gone 404/);
  });

  void it("does not report a page that recovers on retry", async () => {
    // Since the prerender removal, a cold page that loses a race with Notion's
    // rate limiter returns an uncached 500 and recovers on the next request.
    // Reporting that would page on the self-healing case.
    const { code, stdout } = await runSweep({ flaky: ["/cold"] });
    assert.equal(code, 0);
    assert.match(stdout, /recovered on retry/);
    assert.doesNotMatch(stdout, /FAIL \/cold/);
  });

  void it("retries a cold sitemap instead of giving up on it", async () => {
    // /sitemap.xml is server-rendered and crawls Notion, so it is both the
    // first request after a deploy and the most expensive. A single attempt
    // made the whole sweep fail spuriously on 2026-09-04.
    const { code, stdout } = await runSweep({ sitemapColdFailures: 2 });
    assert.equal(code, 0, "a cold sitemap must not fail the sweep outright");
    assert.match(stdout, /retrying \/sitemap\.xml/);
    assert.match(stdout, /1\/1 URLs served 200/);
  });

  void it("reads the sitemap once per attempt, not twice", async () => {
    // Each read triggers a full Notion crawl; fetching it twice per attempt
    // doubled the most expensive request in the sweep.
    await runSweep({});
    assert.equal(sitemapHits, 1);
  });
});
