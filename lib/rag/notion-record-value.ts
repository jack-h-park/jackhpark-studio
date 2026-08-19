import { type ExtendedRecordMap } from "notion-types";

// Notion sometimes returns doubly-nested record entries:
// recordMap.block[id].value = { role, value: Block } instead of the Block
// itself. notion-utils helpers (getPageContentBlockIds, getBlockTitle, ...)
// read `.value` directly, so without normalization content traversal silently
// yields nothing and every page ingests as an empty "Untitled" document.
// https://github.com/NotionX/react-notion-x/issues/682

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
  while (
    v &&
    typeof v === "object" &&
    !(v as Record<string, unknown>).id &&
    (v as Record<string, unknown>).value
  ) {
    v = (v as Record<string, unknown>).value;
  }
  if (!v || typeof v !== "object") return undefined;
  return v as T;
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

function normalizeRecordTable<T extends Record<string, { value?: unknown }>>(
  table: T | undefined,
): T | undefined {
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
