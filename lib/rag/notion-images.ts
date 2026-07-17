import type { Block, Decoration, ExtendedRecordMap } from "notion-types";
import { getPageContentBlockIds, getTextContent } from "notion-utils";

import {
  extractImageSourceFromBlock,
  resolveNotionImageUrl,
} from "./notion-metadata";
import { getBlockValue } from "./notion-record-value";

const HEADING_BLOCK_TYPES = new Set([
  "header",
  "sub_header",
  "sub_sub_header",
]);

export type NotionPageImage = {
  blockId: string;
  url: string;
  /** Author-written caption on the image block, if any. */
  notionCaption: string | null;
  /** Text of the closest heading above the image in document order. */
  nearestHeading: string | null;
  /** Last non-empty text block before the image in document order. */
  precedingText: string | null;
  /** 0-based position among the page's images, in document order. */
  orderIndex: number;
};

function decorationText(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const text = getTextContent(value as Decoration[]).trim();
  return text.length > 0 ? text : null;
}

/**
 * Extract every content image of a Notion page in document order, with the
 * surrounding context (nearest heading, preceding paragraph) that a caption
 * model needs to describe the image usefully. Read-only: no network, no DB.
 *
 * Expects a recordMap already passed through normalizeNotionRecordMap (the
 * prepareNotionPageDocument path does this; callers using raw notion.getPage
 * output must normalize first — see lib/rag/notion-record-value.ts).
 */
export function extractNotionPageImages(
  recordMap: ExtendedRecordMap,
  pageId: string,
): NotionPageImage[] {
  // Intentionally NOT sorted: getPageContentBlockIds returns traversal order,
  // which is what "nearest heading above the image" is defined against.
  const blockIds = getPageContentBlockIds(recordMap, pageId);

  const images: NotionPageImage[] = [];
  let nearestHeading: string | null = null;
  let precedingText: string | null = null;

  for (const blockId of blockIds) {
    if (blockId === pageId) {
      continue;
    }

    const block = (getBlockValue(recordMap.block?.[blockId]) ??
      null) as Block | null;
    if (!block) {
      continue;
    }

    if (block.type && HEADING_BLOCK_TYPES.has(block.type)) {
      const heading = decorationText(block.properties?.title);
      if (heading) {
        nearestHeading = heading;
        // A new section starts; stale paragraph context should not leak in.
        precedingText = null;
      }
      continue;
    }

    if (block.type === "text") {
      const text = decorationText(block.properties?.title);
      if (text) {
        precedingText = text;
      }
      continue;
    }

    if (block.type !== "image") {
      continue;
    }

    const candidate =
      block.format?.display_source ?? extractImageSourceFromBlock(block);
    const url = resolveNotionImageUrl({
      raw: candidate,
      block,
      signedUrls: recordMap.signed_urls,
      fallbackId: blockId,
      skipColorTokens: true,
    });
    if (!url) {
      continue;
    }

    images.push({
      blockId,
      url,
      notionCaption: decorationText(
        (block.properties as { caption?: unknown } | undefined)?.caption,
      ),
      nearestHeading,
      precedingText,
      orderIndex: images.length,
    });
  }

  return images;
}
