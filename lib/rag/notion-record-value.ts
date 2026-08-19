import { type ExtendedRecordMap } from "notion-types";

// Notion sometimes returns doubly-nested record entries:
// recordMap.block[id].value = { role, value: Block } instead of the Block
// itself. notion-utils helpers (getPageContentBlockIds, getBlockTitle, ...)
// read `.value` directly, so without normalization content traversal silently
// yields nothing and every page ingests as an empty "Untitled" document.
// https://github.com/NotionX/react-notion-x/issues/682

// Two levels is all Notion has ever returned. The bound only exists so a
// malformed or self-referential entry cannot spin the loop forever — the
// implementation this replaced in lib/notion.ts capped at 5 for the same
// reason.
const MAX_UNWRAP_DEPTH = 8;

/**
 * Unwrap nested `{ role, value }` wrappers until the actual record (an object
 * with an `id`).
 *
 * This is the single unwrapper for every record table — blocks, collections
 * and collection views alike. All three arrive in the same two shapes
 * (`{ value: Record }` and `{ value: { role, value: Record } }`) and all three
 * carry an `id` on the record itself, so the `id` stop condition is what keeps
 * a record that happens to own a `value` property from being unwrapped one
 * level too far.
 *
 * `T` is a caller-side view of the record's fields; nothing is validated at
 * runtime beyond "it is an object".
 */
export function unwrapRecordValue<T extends object = Record<string, unknown>>(
  entry: { value?: unknown } | null | undefined,
): T | undefined {
  if (!entry) return undefined;
  let v: unknown = entry.value;
  for (
    let depth = 0;
    depth < MAX_UNWRAP_DEPTH &&
    v &&
    typeof v === "object" &&
    !(v as Record<string, unknown>).id &&
    (v as Record<string, unknown>).value;
    depth++
  ) {
    v = (v as Record<string, unknown>).value;
  }
  if (!v || typeof v !== "object") return undefined;
  return v as T;
}

/**
 * Collections copied from another collection must be queried via their parent
 * collection id. Both the sitemap crawl and the page renderer need this, and
 * both used to carry their own copy alongside their own unwrapper.
 */
export function resolveCollectionDataId(
  recordMap: ExtendedRecordMap,
  collectionId: string,
): string {
  const value = unwrapRecordValue<{
    parent_table?: string;
    parent_id?: string;
  }>(recordMap.collection?.[collectionId]);
  if (
    value?.parent_table === "collection" &&
    typeof value.parent_id === "string" &&
    value.parent_id.length > 0
  ) {
    return value.parent_id;
  }
  return collectionId;
}

/** Point lookup variant typed for block entries. */
export function getBlockValue(
  blockEntry: ExtendedRecordMap["block"][string] | undefined,
): ExtendedRecordMap["block"][string]["value"] | undefined {
  return unwrapRecordValue(blockEntry) as
    | ExtendedRecordMap["block"][string]["value"]
    | undefined;
}

function unwrapRecordEntry<T extends { value?: unknown }>(entry: T): T {
  const v = unwrapRecordValue(entry) ?? entry.value;
  if (v === entry.value) return entry;
  return { ...entry, value: v };
}

/**
 * Unwrap every entry of one record table, returning the table unchanged (same
 * reference) when nothing was nested. Exported for callers that need a single
 * table normalized rather than the whole record map — the sitemap crawl
 * normalizes blocks only, because normalizing `collection` there would change
 * which collection schema `getPageProperty` can read, and with it which pages
 * the crawl keeps.
 */
export function normalizeRecordTable<
  T extends Record<string, { value?: unknown }>,
>(table: T | undefined): T | undefined {
  if (!table) return table;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(table)) {
    const unwrapped = unwrapRecordEntry(entry);
    if (unwrapped !== entry) changed = true;
    next[id] = unwrapped;
  }
  return changed ? (next as T) : table;
}

/**
 * Unwrap the block and collection tables once at the fetch boundary, so all
 * downstream consumers (notion-utils included) see the canonical shape.
 */
export function normalizeNotionRecordMap(
  recordMap: ExtendedRecordMap,
): ExtendedRecordMap {
  const block = normalizeRecordTable(recordMap.block);
  const collection = normalizeRecordTable(recordMap.collection);
  if (block === recordMap.block && collection === recordMap.collection) {
    return recordMap;
  }
  return {
    ...recordMap,
    block: block ?? recordMap.block,
    collection: collection ?? recordMap.collection,
  };
}
