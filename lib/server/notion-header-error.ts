export type NotionHeaderCacheErrorCode =
  | "purge_context_unavailable"
  | "revision_not_retained"
  | "invalid_revision";

const messages: Record<NotionHeaderCacheErrorCode, string> = {
  purge_context_unavailable: "Vercel purge context unavailable",
  revision_not_retained: "Header cache revision was not retained",
  invalid_revision: "Invalid header revision",
};

// Stable, bounded diagnostics without serializing cache values or SDK errors.
export class NotionHeaderCacheError extends Error {
  constructor(readonly code: NotionHeaderCacheErrorCode) {
    super(messages[code]);
    this.name = "NotionHeaderCacheError";
  }
}
