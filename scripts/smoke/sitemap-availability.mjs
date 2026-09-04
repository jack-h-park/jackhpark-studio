#!/usr/bin/env node

/**
 * Sweep every URL the sitemap advertises and fail if any of them is not 200.
 *
 * This exists because a build that silently dropped pages is invisible to the
 * canonical smoke: on 2026-09-03, 48 of 162 sitemap URLs were serving 404 while
 * `/`, `/studio`, `/chat` and every API route stayed green. Notion rate-limited
 * the build, getStaticProps turned those 429s into `notFound: true`, and the
 * 404s were cached as if the pages had been deleted. Nothing in the monitoring
 * looked below the top-level routes, so it held for days.
 *
 * Two things this deliberately does NOT do:
 *
 * - It does not run continuously. Pages are generated on demand now
 *   (getStaticPaths returns no paths), so every cold URL costs a Notion fetch.
 *   Sweeping all of them every few minutes would rebuild the same 429 storm and
 *   point it at live traffic. Post-deploy is when the risk is real and the
 *   cache is cold, so that is when this runs — and warming the cache is a
 *   welcome side effect.
 * - It does not fan out. CONCURRENCY stays low for the same reason.
 *
 * A failed URL is retried once before it counts. A cold page that loses a race
 * with the rate limiter now returns an uncached 500 and recovers on the next
 * request, which is a different thing from a page that is actually gone.
 */

const baseUrl = (
  process.env.PROD_BASE_URL ?? "https://www.jackhpark.com"
).replace(/\/$/, "");
const timeoutMs = Number(process.env.SITEMAP_TIMEOUT_MS ?? 60000);
const concurrency = Number(process.env.SITEMAP_CONCURRENCY ?? 4);
const retryDelayMs = Number(process.env.SITEMAP_RETRY_DELAY_MS ?? 5000);

const userAgent = "jackhpark-sitemap-smoke/1.0";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchStatus(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": userAgent },
    });
    return { status: response.status, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readSitemapPaths() {
  const result = await fetchStatus("/sitemap.xml");
  if (result.status !== 200) {
    console.error(
      `FAIL /sitemap.xml ${result.status ?? result.error} — cannot enumerate pages`,
    );
    process.exit(1);
  }

  const response = await fetch(`${baseUrl}/sitemap.xml`, {
    headers: { "User-Agent": userAgent },
  });
  const xml = await response.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  // Compare by pathname so the sweep can run against a preview deployment even
  // though the sitemap always advertises the production host.
  const paths = new Set();
  for (const loc of locs) {
    try {
      const { pathname } = new URL(loc);
      paths.add(pathname === "" ? "/" : pathname);
    } catch {
      console.warn(`skipping unparseable <loc>: ${loc}`);
    }
  }
  return [...paths];
}

const paths = await readSitemapPaths();
console.log(
  `sweeping ${paths.length} sitemap URLs against ${baseUrl} (concurrency ${concurrency})`,
);

const failures = [];
let index = 0;

async function worker() {
  while (index < paths.length) {
    const path = paths[index++];
    let result = await fetchStatus(path);

    if (result.status !== 200) {
      // Retry once: a cold page that lost a race with the rate limiter returns
      // an uncached 500 and recovers, unlike a page that is genuinely missing.
      await sleep(retryDelayMs);
      const retry = await fetchStatus(path);
      if (retry.status === 200) {
        console.log(
          `PASS ${path} 200 ${retry.latencyMs}ms (recovered on retry, first: ${result.status ?? result.error})`,
        );
        continue;
      }
      result = retry;
    }

    if (result.status === 200) {
      console.log(`PASS ${path} 200 ${result.latencyMs}ms`);
    } else {
      console.log(`FAIL ${path} ${result.status ?? result.error}`);
      failures.push({
        path,
        status: result.status,
        error: result.error,
        latencyMs: result.latencyMs,
      });
    }
  }
}

await Promise.all(
  Array.from({ length: Math.max(1, concurrency) }, () => worker()),
);

console.log(`\n${paths.length - failures.length}/${paths.length} URLs served 200`);

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      { baseUrl, total: paths.length, failed: failures.length, failures },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
