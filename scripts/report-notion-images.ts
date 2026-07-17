// scripts/report-notion-images.ts
//
// Phase 2 (image-caption chunks) dry-run: crawl the Notion workspace exactly
// like ingestion does, extract every content image with its caption context,
// and report corpus-wide stats (counts, URL health, captioning cost estimate).
// Read-only — never writes to Supabase or Notion.
//
// Usage:
//   pnpm report:notion-images                 # full workspace
//   pnpm report:notion-images --page <id>     # single page
//   pnpm report:notion-images --json out.json # also write machine-readable report
//   pnpm report:notion-images --skip-url-check

import { writeFile } from "node:fs/promises";

import { NotionAPI } from "notion-client";
import { type ExtendedRecordMap } from "notion-types";
import { getPageTitle } from "notion-utils";
import pMap from "p-map";

import { collectLinkedPagesFromSeeds } from "../lib/admin/manual-ingestor";
import { rootNotionPageId as configRootNotionPageId } from "../lib/config";
import {
  extractNotionPageImages,
  type NotionPageImage,
} from "../lib/rag/notion-images";
import { normalizeNotionRecordMap } from "../lib/rag/notion-record-value";
import { deriveNotionDocIdentifiers } from "../lib/rag/sources/notion";

const notion = new NotionAPI();

const URL_CHECK_CONCURRENCY = 4;
const PAGE_FETCH_CONCURRENCY = 2;
const PAGE_FETCH_MAX_RETRIES = 5;
const URL_CHECK_TIMEOUT_MS = 10_000;
// gpt-4o-mini vision, rough upper bound per image at low detail.
const CAPTION_COST_PER_IMAGE_USD = 0.002;

type CliOptions = {
  pageId: string | null;
  jsonPath: string | null;
  skipUrlCheck: boolean;
};

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    pageId: null,
    jsonPath: null,
    skipUrlCheck: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--skip-url-check") {
      options.skipUrlCheck = true;
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

type ImageUrlHealth = "ok" | "broken" | "skipped";

type ReportedImage = NotionPageImage & {
  urlStatus: number | null;
  urlHealth: ImageUrlHealth;
};

type PageReport = {
  pageId: string;
  canonicalId: string;
  title: string;
  images: ReportedImage[];
};

async function checkImageUrl(
  url: string,
): Promise<{ status: number | null; health: ImageUrlHealth }> {
  const attempt = async (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);
    try {
      return await fetch(url, { method, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response = await attempt("HEAD");
    if (response.status === 405 || response.status === 501) {
      response = await attempt("GET");
    }
    return {
      status: response.status,
      health: response.ok ? "ok" : "broken",
    };
  } catch {
    return { status: null, health: "broken" };
  }
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
      if (!message.includes("429")) {
        throw err;
      }
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
    const recordMap = await notion.getPage(options.pageId);
    return new Map([[options.pageId, recordMap]]);
  }

  const rootPageId = process.env.NOTION_ROOT_PAGE_ID ?? configRootNotionPageId;
  if (!rootPageId) {
    throw new Error(
      "Missing Notion root page ID. Set NOTION_ROOT_PAGE_ID or configure it in site.config.ts.",
    );
  }

  console.log(`Discovering pages (root: ${rootPageId})...`);
  // Reuse the admin ingestor's BFS discovery: getAllPagesInSpace only walks
  // page `content` arrays and misses collection rows, which is where most of
  // this corpus lives.
  const pageIds = await collectLinkedPagesFromSeeds([rootPageId], (event) => {
    if (event.type === "log") {
      console.log(event.message);
    }
  });
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

  const pages: PageReport[] = [];
  for (const [pageId, rawRecordMap] of recordMaps) {
    const recordMap = normalizeNotionRecordMap(rawRecordMap);
    const { canonicalId } = deriveNotionDocIdentifiers(pageId);
    const title = getPageTitle(recordMap) || "Untitled";
    const images = extractNotionPageImages(recordMap, pageId);
    pages.push({
      pageId,
      canonicalId,
      title,
      images: images.map((image) => ({
        ...image,
        urlStatus: null,
        urlHealth: "skipped" as ImageUrlHealth,
      })),
    });
  }

  const allImages = pages.flatMap((page) => page.images);

  if (!options.skipUrlCheck) {
    // Dedupe URL checks: the same asset can appear on multiple pages.
    const byUrl = new Map<string, ReportedImage[]>();
    for (const image of allImages) {
      const list = byUrl.get(image.url) ?? [];
      list.push(image);
      byUrl.set(image.url, list);
    }
    console.log(`Checking ${byUrl.size} unique image URLs...`);
    await pMap(
      byUrl.entries(),
      async ([url, imagesForUrl]) => {
        const { status, health } = await checkImageUrl(url);
        for (const image of imagesForUrl) {
          image.urlStatus = status;
          image.urlHealth = health;
        }
      },
      { concurrency: URL_CHECK_CONCURRENCY },
    );
  }

  const pagesWithImages = pages.filter((page) => page.images.length > 0);
  const uniqueUrls = new Set(allImages.map((image) => image.url));
  const broken = allImages.filter((image) => image.urlHealth === "broken");
  const withCaption = allImages.filter((image) => image.notionCaption);
  const withHeading = allImages.filter((image) => image.nearestHeading);
  const captionableCount = options.skipUrlCheck
    ? allImages.length
    : allImages.length - broken.length;

  console.log("\n--- Per-page image counts ---");
  for (const page of pages.toSorted(
    (a, b) => b.images.length - a.images.length,
  )) {
    if (page.images.length === 0) {
      continue;
    }
    const brokenCount = page.images.filter(
      (image) => image.urlHealth === "broken",
    ).length;
    const brokenNote = brokenCount > 0 ? ` (${brokenCount} broken)` : "";
    console.log(
      `${String(page.images.length).padStart(3)}  ${page.title}${brokenNote}`,
    );
  }

  console.log("\n--- Totals ---");
  console.log(`Pages crawled:        ${pages.length}`);
  console.log(`Pages with images:    ${pagesWithImages.length}`);
  console.log(`Images (total):       ${allImages.length}`);
  console.log(`Images (unique URLs): ${uniqueUrls.size}`);
  if (!options.skipUrlCheck) {
    console.log(`Broken URLs:          ${broken.length}`);
  }
  console.log(`With Notion caption:  ${withCaption.length}`);
  console.log(`With nearby heading:  ${withHeading.length}`);
  console.log(
    `Est. caption cost:    ~$${(captionableCount * CAPTION_COST_PER_IMAGE_USD).toFixed(2)} (${captionableCount} images @ $${CAPTION_COST_PER_IMAGE_USD}/image)`,
  );

  if (broken.length > 0) {
    console.log("\n--- Broken image URLs ---");
    for (const image of broken) {
      const page = pages.find((candidate) =>
        candidate.images.includes(image),
      );
      console.log(
        `[${image.urlStatus ?? "ERR"}] ${page?.title ?? "?"} :: ${image.url.slice(0, 120)}`,
      );
    }
  }

  if (options.jsonPath) {
    await writeFile(
      options.jsonPath,
      JSON.stringify({ generatedForRoot: options.pageId ?? "workspace", pages }, null, 2),
      "utf8",
    );
    console.log(`\nJSON report written to ${options.jsonPath}`);
  }
}

await main();
