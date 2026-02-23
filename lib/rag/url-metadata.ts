import type { RagDocumentMetadata } from "./metadata";
import { deriveTitleFromUrl } from "./url-title";

export { deriveTitleFromUrl } from "./url-title";

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
  const { fetchFaviconForUrl } = await import("./fetch-favicon");
  const faviconUrl = await fetchFaviconForUrl(sourceUrl);
  if (!faviconUrl) {
    return {};
  }

  return {
    icon_kind: "favicon" as const,
    icon_image_url: faviconUrl,
  };
}
