export type NotionHeaderCacheErrorCode =
  | "purge_context_unavailable"
  | "purge_failed"
  | "revision_write_failed"
  | "revision_read_failed"
  | "revision_changed"
  | "revision_not_retained"
  | "invalid_revision";

const messages: Record<NotionHeaderCacheErrorCode, string> = {
  purge_context_unavailable: "Vercel purge context unavailable",
  purge_failed: "Header cache purge failed",
  revision_write_failed: "Header cache revision write failed",
  revision_read_failed: "Header cache revision read failed",
  revision_changed:
    "A different header revision was observed during verification",
  revision_not_retained: "Header cache revision was not retained",
  invalid_revision: "Invalid header revision",
};

export type HeaderRevisionVerification = {
  attempts: number;
  missing: number;
  previous: number;
  different: number;
  invalid: number;
  waitedMs: number;
};

// Stable, bounded diagnostics without serializing cache values or SDK errors.
export class NotionHeaderCacheError extends Error {
  constructor(
    readonly code: NotionHeaderCacheErrorCode,
    readonly verification?: HeaderRevisionVerification,
  ) {
    super(messages[code]);
    this.name = "NotionHeaderCacheError";
  }
}
