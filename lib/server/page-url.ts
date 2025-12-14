import { host } from "@/lib/config";
import { getSiteMap } from "@/lib/get-site-map";
import { notionLogger } from "@/lib/logging/logger";

export type CanonicalPageLookup = Record<string, string>;

let canonicalLookupPromise: Promise<CanonicalPageLookup> | null = null;

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

  notionLogger.debug("[page-url] canonical map loaded", {
    count: Object.keys(lookup).length,
  });

  return lookup;
}

export function resolvePublicPageUrl(
  pageId: string | null | undefined,
  lookup: CanonicalPageLookup,
): string | null {
  const normalized = normalizePageId(pageId);
  if (!normalized) {
    notionLogger.debug("[page-url] invalid id", { pageId });
    return null;
  }

  const canonicalPath = lookup[normalized];
  if (!canonicalPath) {
    notionLogger.debug("[page-url] canonical miss", { pageId, normalized });
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

export function formatNotionPageId(value?: string | null): string | null {
  const normalized = normalizePageId(value);
  if (!normalized) {
    return null;
  }
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(
    12,
    16,
  )}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}
