import { Buffer } from "node:buffer";

import type { ExtendedRecordMap } from "notion-types";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 32;
const MAX_ENTRY_BYTES = 1024 * 1024;

function isNonemptyRecordMap(value: unknown): value is ExtendedRecordMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const block = (value as { block?: unknown }).block;
  return (
    !!block &&
    typeof block === "object" &&
    !Array.isArray(block) &&
    Object.keys(block).length > 0
  );
}

/** Retains bounded JSON payloads for one run, not references to provider responses. */
export function createNotionRunCache(): {
  remember(pageId: string, recordMap: ExtendedRecordMap): void;
  take(pageId: string): ExtendedRecordMap | undefined;
  clear(): void;
} {
  const snapshots = new Map<string, { json: string; bytes: number }>();
  let retainedBytes = 0;

  const remove = (pageId: string) => {
    const entry = snapshots.get(pageId);
    if (entry) {
      retainedBytes -= entry.bytes;
      snapshots.delete(pageId);
    }
    return entry;
  };

  return {
    remember(pageId, recordMap) {
      remove(pageId);
      try {
        if (!isNonemptyRecordMap(recordMap)) return;
        const json = JSON.stringify(recordMap);
        if (typeof json !== "string") return;
        const bytes = Buffer.byteLength(json, "utf8");
        if (bytes > MAX_ENTRY_BYTES || !isNonemptyRecordMap(JSON.parse(json)))
          return;
        while (
          snapshots.size >= MAX_ENTRIES ||
          retainedBytes + bytes > MAX_BYTES
        ) {
          const oldest = snapshots.keys().next().value;
          if (oldest === undefined) break;
          remove(oldest);
        }
        snapshots.set(pageId, { json, bytes });
        retainedBytes += bytes;
      } catch {
        // Serialization failures are ordinary misses; processing retains its retry path.
      }
    },
    take(pageId) {
      const entry = remove(pageId);
      return entry ? (JSON.parse(entry.json) as ExtendedRecordMap) : undefined;
    },
    clear() {
      snapshots.clear();
      retainedBytes = 0;
    },
  };
}
