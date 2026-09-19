import { NotionAPI } from "notion-client";

const DEFAULT_NOTION_API_BASE_URL = "https://www.notion.so/api/v3";

// notion-client 7.7.1 sends no User-Agent, and Cloudflare answers those
// requests with a 403 HTML block page, which surfaces as "page load error …
// 403 Forbidden" on every page fetch. Upstream fixed this in notion-client
// 7.10.1 by sending a default User-Agent; until this repo is on that version,
// send our own. The value identifies the site rather than impersonating a
// browser.
const DEFAULT_NOTION_USER_AGENT =
  "jackhpark-studio (+https://www.jackhpark.com)";

export const notion = new NotionAPI({
  apiBaseUrl: process.env.NOTION_API_BASE_URL ?? DEFAULT_NOTION_API_BASE_URL,
  ofetchOptions: {
    headers: {
      "user-agent": process.env.NOTION_USER_AGENT ?? DEFAULT_NOTION_USER_AGENT,
    },
  },
});
