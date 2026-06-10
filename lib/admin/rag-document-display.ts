import type { RagDocumentRecord } from "@/lib/admin/rag-documents";
import {
  parseRagDocumentMetadata,
  type RagDocumentMetadata,
} from "@/lib/rag/metadata";

export type DocumentRow = RagDocumentRecord & {
  displayTitle: string;
};

export type DocumentDisplayInfo = {
  metadata: RagDocumentMetadata;
  subtitle?: string;
  previewImageUrl?: string;
  iconEmoji?: string;
  iconImageUrl?: string;
  teaserText?: string;
};

export function getStatusPillVariant(
  status: RagDocumentRecord["status"],
): "success" | "warning" | "error" | "info" | "muted" {
  switch (status) {
    case "active":
      return "success";
    case "missing":
      return "warning";
    case "archived":
      return "info";
    case "soft_deleted":
      return "muted";
    default:
      return "muted";
  }
}

export function formatStatusLabel(status: RagDocumentRecord["status"]): string {
  if (!status) {
    return "Unknown";
  }
  const label = status.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function isRetrievalEligible(
  status: RagDocumentRecord["status"],
): boolean {
  return status === "active";
}

export function formatSourceUrlForDisplay(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const tail = segments.slice(-1).join(" / ");
    return tail ? `${parsed.hostname}/${tail}` : parsed.hostname;
  } catch {
    return sourceUrl;
  }
}

export function buildDocumentDisplayInfo(doc: DocumentRow): DocumentDisplayInfo {
  const metadata = parseRagDocumentMetadata(doc.metadata);
  const breadcrumbSubtitle =
    metadata.breadcrumb && metadata.breadcrumb.length > 0
      ? metadata.breadcrumb.join(" / ")
      : undefined;
  const trimmedSubtitle = metadata.subtitle?.trim();
  const subtitle = trimmedSubtitle || breadcrumbSubtitle;
  const previewImageUrl = metadata.preview_image_url?.trim() || undefined;
  const teaserText = metadata.teaser_text?.trim() || undefined;
  const iconEmoji = metadata.icon_emoji?.trim() || undefined;
  const iconImageUrl = metadata.icon_image_url?.trim() || undefined;

  return {
    metadata,
    subtitle,
    previewImageUrl,
    iconEmoji,
    iconImageUrl,
    teaserText,
  };
}

const PREVIEW_TEXT_LIMIT = 420;

export function buildPreviewSnippet(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }

  const normalized = text.replaceAll(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length <= PREVIEW_TEXT_LIMIT
    ? normalized
    : `${normalized.slice(0, PREVIEW_TEXT_LIMIT).trim()}…`;
}
