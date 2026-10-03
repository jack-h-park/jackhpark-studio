import type { ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";

import { rootNotionPageId } from "@/lib/config";
import { notion } from "@/lib/notion-api";
import { withRateLimitRetry } from "@/lib/notion-rate-limit";
import { unwrapRecordValue } from "@/lib/rag/notion-record-value";

export type NotionNavigationHeader = {
  headerRecordMap: ExtendedRecordMap | null;
  headerBlockId: string;
};

const HEADER_TTL_MS = 3_600_000;

export function createNotionNavigationHeaderLoader({
  fetchRoot,
  now,
}: {
  fetchRoot(pageId: string): Promise<ExtendedRecordMap>;
  now(): number;
}): () => Promise<NotionNavigationHeader> {
  const canonicalRootPageId =
    parsePageId(rootNotionPageId, { uuid: true }) ?? rootNotionPageId;
  const normalizedRootPageId = canonicalRootPageId.replaceAll("-", "");

  let cachedHeader: NotionNavigationHeader | null = null;
  let expiresAt = 0;
  let inFlight: Promise<NotionNavigationHeader> | null = null;

  return async () => {
    if (cachedHeader && now() < expiresAt) return cachedHeader;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const recordMap = await withRateLimitRetry(() =>
          fetchRoot(canonicalRootPageId),
        );
        const rawBlockEntry =
          recordMap.block?.[canonicalRootPageId] ??
          recordMap.block?.[normalizedRootPageId] ??
          recordMap.block?.[rootNotionPageId];

        if (rawBlockEntry) {
          const normalizedValue = unwrapRecordValue<{ id?: string }>(
            rawBlockEntry,
          );
          const blockEntry = {
            ...rawBlockEntry,
            value: {
              ...normalizedValue,
              id: normalizedValue?.id ?? canonicalRootPageId,
            },
          } as typeof rawBlockEntry;

          cachedHeader = {
            headerRecordMap: {
              block: {
                [canonicalRootPageId]: blockEntry,
                [normalizedRootPageId]: blockEntry,
              },
              collection: {},
              collection_query: {},
              collection_view: {},
              notion_user: {},
              signed_urls: {},
            },
            headerBlockId: canonicalRootPageId,
          };
          // Reads never extend the deadline; only successful fetches start an hour.
          expiresAt = now() + HEADER_TTL_MS;
          return cachedHeader;
        }
      } catch {
        // A failed read leaves no fresh cache entry, so the next call can recover.
      }

      return {
        headerRecordMap: null,
        headerBlockId: canonicalRootPageId,
      };
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };
}

const defaultLoader = createNotionNavigationHeaderLoader({
  fetchRoot: (pageId) =>
    notion.getPage(pageId, {
      chunkLimit: 1,
      fetchCollections: false,
      fetchMissingBlocks: false,
      fetchRelationPages: false,
      signFileUrls: false,
    }),
  now: () => Date.now(),
});

export async function loadNotionNavigationHeader(): Promise<NotionNavigationHeader> {
  return defaultLoader();
}
