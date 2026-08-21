/**
 * Headers required to fetch a Notion-hosted image from the server.
 *
 * Node's global fetch sends `user-agent: node`, and www.notion.so's bot filter
 * answers that with a 403 HTML page — before it ever issues the redirect to
 * the signed CDN URL. Any explicit value passes: the identity below is for
 * Notion's logs, not a credential, and nothing about it needs to stay secret
 * or match a real browser. Omitting the header is the only thing that fails.
 *
 * This silently emptied `recordMap.preview_images` in production (133 entries,
 * of which only the 2 inline `data:` URIs — the ones needing no fetch — held
 * real placeholder data).
 *
 * Browsers are unaffected: they send their own UA. This only matters where the
 * *server* fetches the image.
 */
export const NOTION_IMAGE_FETCH_HEADERS = {
  "user-agent": "jackhpark-studio/1.0 (+https://www.jackhpark.com)",
} as const;
