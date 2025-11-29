import { host } from "@/lib/config";
import { getSiteMap } from "@/lib/get-site-map";

export type CanonicalPageLookup = Record<string, string>;

let canonicalLookupPromise: Promise<CanonicalPageLookup> | null = null;
const DEBUG_PAGE_URLS =
  (process.env.DEBUG_RAG_URLS ?? "").toLowerCase() === "true";

export async function loadCanonicalPageLookup(): Promise<CanonicalPageLookup> {
  if (!canonicalLookupPromise) {
    canonicalLookupPromise = buildCanonicalLookup();
  }

  try {
    return await canonicalLookupPromise;
  } catch (err) {
    canonicalLookupPromise = null;
    throw err;
  }
}

async function buildCanonicalLookup(): Promise<CanonicalPageLookup> {
  const siteMap = await getSiteMap().catch((err) => {
    console.warn("[page-url] failed to load site map", err);
    return null;
  });

  const canonicalMap = siteMap?.canonicalPageMap ?? {};
  const lookup: CanonicalPageLookup = {};

  for (const [canonicalPath, notionPageId] of Object.entries(canonicalMap)) {
    const normalizedId = normalizePageId(notionPageId);
    if (normalizedId) {
      lookup[normalizedId] = canonicalPath;
    }
  }

  if (DEBUG_PAGE_URLS) {
    console.log("[page-url] canonical map loaded", {
      count: Object.keys(lookup).length,
    });
  }

  return lookup;
}

export function resolvePublicPageUrl(
  pageId: string | null | undefined,
  lookup: CanonicalPageLookup,
): string | null {
  const normalized = normalizePageId(pageId);
  if (!normalized) {
    if (DEBUG_PAGE_URLS) {
      console.log("[page-url] invalid id", { pageId });
    }
    return null;
  }

  const canonicalPath = lookup[normalized];
  if (!canonicalPath) {
    if (DEBUG_PAGE_URLS) {
      console.log("[page-url] canonical miss", { pageId, normalized });
    }
    return null;
  }

  const baseUrl = host.replace(/\/+$/, "");
  const trimmedPath = canonicalPath.replace(/^\/+/, "");
  if (!trimmedPath) {
    return baseUrl;
  }

  return `${baseUrl}/${trimmedPath}`;
}

export function normalizePageId(pageId?: string | null): string | null {
  if (!pageId || typeof pageId !== "string") {
    return null;
  }

  const stripped = pageId.replaceAll("-", "").trim().toLowerCase();
  if (stripped.length !== 32) {
    return null;
  }

  return stripped;
}
