import { fetchFaviconForUrl } from "@/lib/rag/fetch-favicon";

import type { RagDocumentMetadata } from "./metadata";

export function deriveTitleFromUrl(
  sourceUrl?: string | null,
): string | undefined {
  if (!sourceUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const tail = segments.slice(-2).join(" / ");
    return tail || parsed.hostname;
  } catch {
    return undefined;
  }
}

export async function buildUrlRagDocumentMetadata({
  sourceUrl,
  htmlTitle,
  ogTitle,
  ogImageUrl,
}: {
  sourceUrl: string;
  htmlTitle?: string | null;
  ogTitle?: string | null;
  ogImageUrl?: string | null;
}): Promise<RagDocumentMetadata> {
  const bestTitle =
    (ogTitle && ogTitle.trim()) ||
    (htmlTitle && htmlTitle.trim()) ||
    deriveTitleFromUrl(sourceUrl) ||
    sourceUrl;

  return {
    title: bestTitle,
    subtitle: undefined,
    source_kind: "url",
    origin_id: sourceUrl,
    breadcrumb: undefined,
    preview_image_url: ogImageUrl ?? null,
    ...(await resolveUrlFaviconMetadata(sourceUrl)),
  };
}

async function resolveUrlFaviconMetadata(
  sourceUrl: string,
): Promise<Partial<RagDocumentMetadata>> {
  const faviconUrl = await fetchFaviconForUrl(sourceUrl);
  if (!faviconUrl) {
    return {};
  }

  return {
    icon_kind: "favicon" as const,
    icon_image_url: faviconUrl,
  };
}
