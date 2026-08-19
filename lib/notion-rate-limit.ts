// Retry wrapper for the unofficial Notion API.
//
// Notion 429s even at concurrency 1 once a traversal exceeds a few dozen pages, so this is
// a precondition for any bulk Notion work rather than a hardening nicety. It was written
// for the sitemap crawl, where a skipped page silently degrades to a UUID URL; ingestion
// has the same exposure, where a skipped page silently drops out of the corpus.
//
// Shared so the two callers cannot drift apart on how many attempts a 429 gets.

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2000;

/** True for the rate-limit responses this wrapper is willing to retry. */
function isRateLimited(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("429");
}

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = MAX_ATTEMPTS, baseDelayMs = BASE_DELAY_MS } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt + 1 >= maxAttempts || !isRateLimited(err)) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** attempt),
      );
    }
  }
}
