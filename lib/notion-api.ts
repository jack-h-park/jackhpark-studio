import { NotionAPI } from 'notion-client'

const DEFAULT_NOTION_API_BASE_URL = 'https://www.notion.so/api/v3'

export const notion = new NotionAPI({
  apiBaseUrl: process.env.NOTION_API_BASE_URL ?? DEFAULT_NOTION_API_BASE_URL
})
