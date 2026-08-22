// scripts/report-external-images.ts
//
// Find Notion-stored image URLs that point at hosts we do not control, and
// report which of them no longer resolve.
//
// Notion attachments are re-signed on demand and effectively never rot. These
// do: when you bookmark a page, Notion snapshots whatever preview image the
// site advertised at that moment (`bookmark_cover` / `bookmark_icon`) and keeps
// that URL forever. If the file is later renamed, deleted, or served under a
// thumbnail spec the host stops honouring, the bookmark silently renders with a
// broken cover — nothing in the app can tell, because the URL is still a
// perfectly well-formed link to somebody else's server.
//
// Two real examples from this corpus: a Wikipedia bookmark whose Commons file
// was removed (gone for good), and another whose *original* file is fine but
// whose stored `1200px-` thumbnail URL Wikimedia now rejects (fixable by
// re-adding the bookmark). Those need different actions, so the report
// separates them.
//
// Read-only — never writes to Supabase or Notion.
//
// Usage:
//   pnpm report:external-images                 # full workspace
//   pnpm report:external-images --page <id>     # single page
//   pnpm report:external-images --json out.json # also write machine-readable report
//   pnpm report:external-images --all           # list healthy URLs too

import { writeFile } from "node:fs/promises";

import { type Block, type ExtendedRecordMap } from "notion-types";
import { getPageTitle, parsePageId } from "notion-utils";
import pMap from "p-map";

import { collectLinkedPagesFromSeeds } from "../lib/admin/manual-ingestor";
import { rootNotionPageId as configRootNotionPageId } from "../lib/config";
import { notion } from "../lib/notion-api";
import { NOTION_IMAGE_FETCH_HEADERS } from "../lib/notion-image-fetch";
import { normalizeNotionRecordMap } from "../lib/rag/notion-record-value";

const URL_CHECK_CONCURRENCY = 4;
const PAGE_FETCH_CONCURRENCY = 2;
const PAGE_FETCH_MAX_RETRIES = 5;
const URL_CHECK_TIMEOUT_MS = 10_000;

/** Hosts whose URLs Notion re-signs for us; rot is not a risk there. */
function isNotionHosted(url: string): boolean {
  return (
    url.startsWith("data:") ||
    /^https?:\/\/[^/]*(notion\.so|notion-static\.com|notionusercontent\.com|amazonaws\.com)/i.test(
      url,
    )
  );
}

type CliOptions = {
  pageId: string | null;
  jsonPath: string | null;
  listHealthy: boolean;
};

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    pageId: null,
    jsonPath: null,
    listHealthy: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--all") {
      options.listHealthy = true;
    } else if (arg === "--page" || arg === "--page-id") {
      options.pageId = args[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith("--page=")) {
      options.pageId = arg.split("=", 2)[1] ?? null;
    } else if (arg === "--json") {
      options.jsonPath = args[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith("--json=")) {
      options.jsonPath = arg.split("=", 2)[1] ?? null;
    }
  }

  return options;
}

type UrlRole = "bookmark cover" | "bookmark icon" | "page cover" | "page icon";

type Verdict =
  | "ok"
  | "gone" // the host no longer serves this file at all
  | "stale-thumbnail" // the original is fine; only the stored variant is dead
  | "notion-proxy-only"; // upstream is fine but Notion refuses to proxy it

type Finding = {
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  role: UrlRole;
  label: string;
  url: string;
  proxyStatus: number | null;
  directStatus: number | null;
  verdict: Verdict;
  hint: string;
};

function blockValue(raw: unknown): Block | null {
  let node: unknown = raw;
  while (
    node &&
    typeof node === "object" &&
    "value" in (node as Record<string, unknown>)
  ) {
    node = (node as { value?: unknown }).value;
  }
  return node && typeof node === "object" && "id" in node
    ? (node as Block)
    : null;
}

function plainTitle(block: Block | null): string {
  const title = block?.properties?.title;
  if (!Array.isArray(title)) return "";
  return title
    .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
    .join("")
    .trim();
}

/**
 * The URL a visitor's browser actually requests. Notion proxies external
 * images through its own endpoint, so this — not the raw URL — decides whether
 * the image renders.
 */
function notionProxyUrl(url: string, blockId: string): string {
  return `https://www.notion.so/image/${encodeURIComponent(url)}?table=block&id=${blockId}&cache=v2`;
}

/**
 * Wikimedia stores generated thumbnails under `/thumb/<a>/<ab>/<file>/<spec>-<file>`.
 * Dropping the `/thumb/` segment and the spec yields the original upload, which
 * lets us tell "the picture is gone" from "only Notion's snapshotted variant is".
 */
function originalFileUrl(url: string): string | null {
  const match = /^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/thumb\/(.+)\/[^/]+$/.exec(
    url,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

function collectUrls(
  recordMap: ExtendedRecordMap,
): Array<{ blockId: string; role: UrlRole; label: string; url: string }> {
  const found: Array<{
    blockId: string;
    role: UrlRole;
    label: string;
    url: string;
  }> = [];

  for (const [blockId, entry] of Object.entries(recordMap.block ?? {})) {
    const block = blockValue(entry);
    if (!block) continue;

    const format = (block.format ?? {}) as Record<string, unknown>;
    const label = plainTitle(block) || block.type;

    const candidates: Array<[UrlRole, unknown]> = [
      ["bookmark cover", format.bookmark_cover],
      ["bookmark icon", format.bookmark_icon],
      ["page cover", format.page_cover],
      ["page icon", format.page_icon],
      // Deliberately not `format.display_source`: on video/embed blocks that is
      // the embed URL (a YouTube watch page, say), not an image. Notion's image
      // proxy correctly refuses those with a 422, which would otherwise land
      // here as a wall of false positives.
    ];

    for (const [role, value] of candidates) {
      if (typeof value !== "string" || !value.startsWith("http")) continue;
      if (isNotionHosted(value)) continue;
      found.push({ blockId, role, label, url: value });
    }
  }

  return found;
}

async function statusOf(url: string): Promise<number | null> {
  const attempt = async (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method,
        signal: controller.signal,
        headers: NOTION_IMAGE_FETCH_HEADERS,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response = await attempt("HEAD");
    // Some CDNs reject HEAD outright; fall back before calling it broken.
    if (response.status === 405 || response.status === 501) {
      response = await attempt("GET");
    }
    return response.status;
  } catch {
    return null;
  }
}

function verdictFor(
  proxyStatus: number | null,
  directStatus: number | null,
  originalStatus: number | null,
): { verdict: Verdict; hint: string } {
  const proxyOk = proxyStatus !== null && proxyStatus < 400;
  if (proxyOk) return { verdict: "ok", hint: "" };

  const directOk = directStatus !== null && directStatus < 400;
  if (directOk) {
    return {
      verdict: "notion-proxy-only",
      hint: "Upstream serves this fine; Notion will not proxy it. Re-add the bookmark, or host the image yourself.",
    };
  }

  if (originalStatus !== null && originalStatus < 400) {
    return {
      verdict: "stale-thumbnail",
      hint: "The original file is still there — only the stored thumbnail URL is dead. Re-add the bookmark so Notion snapshots a current one.",
    };
  }

  return {
    verdict: "gone",
    // Deliberately not "re-adding will not help". A dead path does not mean a
    // dead image: a Wikipedia file that moved from Commons to a local upload
    // 404'd here, and re-adding the bookmark picked up its new location,
    // because Notion re-snapshots whatever the source page advertises today.
    hint: "Upstream serves nothing at this path. Re-add the bookmark first — the source may now advertise the image from somewhere else. If the cover comes back empty, pick a new source or drop it.",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPageWithRetry(pageId: string): Promise<ExtendedRecordMap> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= PAGE_FETCH_MAX_RETRIES; attempt += 1) {
    try {
      return await notion.getPage(pageId);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("429")) throw err;
      // Exponential backoff on Notion rate limits: 1s, 2s, 4s, 8s, 16s.
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function collectRecordMaps(
  options: CliOptions,
): Promise<Map<string, ExtendedRecordMap>> {
  if (options.pageId) {
    // Notion page ids travel in two shapes — bare hex from a URL, dashed uuid
    // from the API — but every downstream block lookup keys on the dashed one.
    // A bare id used to fetch the page just fine and then match no blocks at
    // all, so the report said "0 images" for a page full of them.
    const pageId = parsePageId(options.pageId);
    if (!pageId) {
      throw new Error(
        `--page: "${options.pageId}" is not a Notion page id (expected 32 hex characters, dashed or not).`,
      );
    }
    return new Map([[pageId, await notion.getPage(pageId)]]);
  }

  const rootPageId = process.env.NOTION_ROOT_PAGE_ID ?? configRootNotionPageId;
  if (!rootPageId) {
    throw new Error(
      "Missing Notion root page ID. Set NOTION_ROOT_PAGE_ID or configure it in site.config.ts.",
    );
  }

  console.log(`Discovering pages (root: ${rootPageId})...`);
  const { pageIds, complete } = await collectLinkedPagesFromSeeds(
    [rootPageId],
    (event) => {
      if (event.type === "log") console.log(event.message);
    },
  );
  if (!complete) {
    console.warn(
      "⚠️  Discovery did not reach every page (cap hit, or a fetch failed). This report covers what was visited, not the whole workspace.",
    );
  }
  console.log(`Discovered ${pageIds.length} pages. Fetching record maps...`);

  const result = new Map<string, ExtendedRecordMap>();
  await pMap(
    pageIds,
    async (pageId) => {
      try {
        result.set(pageId, await getPageWithRetry(pageId));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Skipping ${pageId}: ${message}`);
      }
    },
    { concurrency: PAGE_FETCH_CONCURRENCY },
  );
  return result;
}

async function main() {
  const options = parseCliOptions();
  const recordMaps = await collectRecordMaps(options);
  console.log(`Fetched ${recordMaps.size} pages.`);

  type Pending = (typeof candidates)[number];
  const candidates: Array<{
    pageId: string;
    pageTitle: string;
    blockId: string;
    role: UrlRole;
    label: string;
    url: string;
  }> = [];

  for (const [pageId, rawRecordMap] of recordMaps) {
    const recordMap = normalizeNotionRecordMap(rawRecordMap);
    const pageTitle = getPageTitle(recordMap) || "Untitled";
    for (const hit of collectUrls(recordMap)) {
      candidates.push({ pageId, pageTitle, ...hit });
    }
  }

  // One URL can be reused across pages (a shared favicon, say); check it once.
  const byUrl = new Map<string, Pending[]>();
  for (const candidate of candidates) {
    const bucket = byUrl.get(candidate.url);
    if (bucket) bucket.push(candidate);
    else byUrl.set(candidate.url, [candidate]);
  }

  console.log(
    `Found ${candidates.length} externally hosted image URLs (${byUrl.size} unique). Checking...`,
  );

  const findings: Finding[] = [];
  await pMap(
    [...byUrl.entries()],
    async ([url, uses]) => {
      const first = uses[0]!;
      const proxyStatus = await statusOf(notionProxyUrl(url, first.blockId));
      // Only pay for the upstream probes when the visitor-facing URL failed.
      const directStatus =
        proxyStatus === null || proxyStatus >= 400
          ? await statusOf(url)
          : proxyStatus;
      const original =
        directStatus !== null && directStatus >= 400
          ? originalFileUrl(url)
          : null;
      const originalStatus = original ? await statusOf(original) : null;

      const { verdict, hint } = verdictFor(
        proxyStatus,
        directStatus,
        originalStatus,
      );

      for (const use of uses) {
        findings.push({
          pageId: use.pageId,
          pageTitle: use.pageTitle,
          pageUrl: `https://www.jackhpark.com/${use.pageId.replaceAll("-", "")}`,
          role: use.role,
          label: use.label,
          url,
          proxyStatus,
          directStatus,
          verdict,
          hint,
        });
      }
    },
    { concurrency: URL_CHECK_CONCURRENCY },
  );

  const broken = findings.filter((finding) => finding.verdict !== "ok");
  broken.sort((a, b) => a.pageTitle.localeCompare(b.pageTitle));

  console.log("\n--- Broken external images ---");
  if (broken.length === 0) {
    console.log("None. Every externally hosted image still resolves.");
  }
  for (const finding of broken) {
    console.log(
      `\n[${finding.verdict}] ${finding.pageTitle} — ${finding.role}: ${finding.label}`,
    );
    console.log(`  page:   ${finding.pageUrl}`);
    console.log(`  url:    ${finding.url.slice(0, 140)}`);
    console.log(
      `  status: proxy=${finding.proxyStatus ?? "error"} direct=${finding.directStatus ?? "error"}`,
    );
    console.log(`  fix:    ${finding.hint}`);
  }

  if (options.listHealthy) {
    const healthy = findings.filter((finding) => finding.verdict === "ok");
    console.log(`\n--- Healthy (${healthy.length}) ---`);
    for (const finding of healthy) {
      console.log(
        `  ${finding.pageTitle} — ${finding.role}: ${finding.url.slice(0, 110)}`,
      );
    }
  }

  const byVerdict = broken.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.verdict] = (acc[finding.verdict] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\n--- Totals ---");
  console.log(`Pages crawled:        ${recordMaps.size}`);
  console.log(`External images:      ${candidates.length}`);
  console.log(`Unique URLs checked:  ${byUrl.size}`);
  console.log(`Broken:               ${broken.length}`);
  for (const [verdict, count] of Object.entries(byVerdict)) {
    console.log(`  ${verdict.padEnd(20)}${count}`);
  }

  if (options.jsonPath) {
    await writeFile(options.jsonPath, JSON.stringify(findings, null, 2));
    console.log(`\nWrote ${options.jsonPath}`);
  }

  // Non-zero exit so this can gate a scheduled check without parsing stdout.
  if (broken.length > 0) process.exitCode = 1;
}

await main();
