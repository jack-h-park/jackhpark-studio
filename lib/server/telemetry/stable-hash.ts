import { createHash } from "node:crypto";

function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSort);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedEntries = Object.entries(record).toSorted(([a], [b]) =>
      a.localeCompare(b),
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, val] of sortedEntries) {
      sorted[key] = deepSort(val);
    }
    return sorted;
  }
  return value;
}

export function stableHash(value: unknown): string {
  try {
    const sorted = deepSort(value);
    const serialized = JSON.stringify(sorted);
    return createHash("sha256").update(serialized).digest("hex");
  } catch {
    return "hash:error";
  }
}
