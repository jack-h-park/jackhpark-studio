import { createHash } from "node:crypto";

export type CacheKey = string;

type CacheEntry = {
  serialized: string;
  bytes: number;
  expiresAt: number;
};

export interface CacheClient {
  get<T>(key: CacheKey): Promise<T | null>;
  set<T>(key: CacheKey, value: T, ttlSeconds: number): Promise<void>;
}

// These bound retained serialized payloads, not total process memory or temporary copies.
const MAX_MEMORY_ENTRIES = 256;
const MAX_MEMORY_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024;
const memoryStore = new Map<CacheKey, CacheEntry>();
let memoryBytes = 0;

function removeMemoryEntry(key: CacheKey): void {
  const entry = memoryStore.get(key);
  if (entry) {
    memoryBytes -= entry.bytes;
    memoryStore.delete(key);
  }
}

function expireMemoryEntries(now: number): void {
  for (const [key, entry] of memoryStore) {
    if (now >= entry.expiresAt) removeMemoryEntry(key);
  }
}

function serializeCacheValue(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, (_key, item: unknown) => {
      const kind = typeof item;
      if (
        kind === "function" ||
        kind === "symbol" ||
        kind === "bigint" ||
        (kind === "number" && !Number.isFinite(item))
      ) {
        throw new TypeError("Unsupported cache value");
      }
      if (item !== null && kind === "object" && !Array.isArray(item)) {
        const prototype: unknown = Object.getPrototypeOf(item);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError("Unsupported cache object");
        }
      }
      return item;
    });
  } catch {
    // Caching is optional: circular values, throwing getters and non-JSON objects miss.
    return undefined;
  }
}

export const memoryCacheClient: CacheClient = {
  async get<T>(key: CacheKey): Promise<T | null> {
    expireMemoryEntries(Date.now());
    const entry = memoryStore.get(key);
    if (!entry) {
      return null;
    }
    memoryStore.delete(key);
    memoryStore.set(key, entry);
    return JSON.parse(entry.serialized) as T;
  },
  async set<T>(key: CacheKey, value: T, ttlSeconds: number): Promise<void> {
    const now = Date.now();
    expireMemoryEntries(now);
    removeMemoryEntry(key);
    const expiresAt = now + ttlSeconds * 1000;
    if (
      !Number.isFinite(ttlSeconds) ||
      ttlSeconds <= 0 ||
      !Number.isFinite(expiresAt)
    ) {
      return;
    }
    const serialized = serializeCacheValue(value);
    if (serialized === undefined) return;
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > MAX_ENTRY_BYTES) return;

    while (
      memoryStore.size >= MAX_MEMORY_ENTRIES ||
      memoryBytes + bytes > MAX_MEMORY_BYTES
    ) {
      const oldestKey = memoryStore.keys().next().value;
      if (oldestKey === undefined) break;
      removeMemoryEntry(oldestKey);
    }
    memoryStore.set(key, { serialized, bytes, expiresAt });
    memoryBytes += bytes;
  },
};

export function clearMemoryCache(): void {
  memoryStore.clear();
  memoryBytes = 0;
}

function stableStringify(value: unknown): string {
  // Deterministic JSON-like stringify:
  // - Sorts object keys
  // - Preserves array order
  // - Skips `undefined` object properties (like JSON.stringify)
  // - Serializes Dates as ISO strings
  // - Serializes BigInt as a string
  // - Throws on circular references
  const seen = new WeakSet<object>();

  const stringifyInner = (v: unknown): unknown => {
    if (v === null) return null;

    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return v;
    if (t === "bigint") return (v as bigint).toString();
    if (t === "undefined") return undefined;

    if (v instanceof Date) return v.toISOString();

    if (Array.isArray(v)) {
      // JSON.stringify converts `undefined` in arrays to null
      return v.map((item) => {
        const mapped = stringifyInner(item);
        return mapped === undefined ? null : mapped;
      });
    }

    if (t === "object") {
      const obj = v as Record<string, unknown>;
      if (seen.has(obj)) {
        throw new Error("stableStringify: circular reference");
      }
      seen.add(obj);

      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj).toSorted()) {
        const mapped = stringifyInner(obj[key]);
        // JSON.stringify omits `undefined` object properties
        if (mapped !== undefined) {
          out[key] = mapped;
        }
      }

      seen.delete(obj);
      return out;
    }

    // Fallback for functions / symbols / etc: match JSON.stringify behavior (omit)
    return undefined;
  };

  const normalized = stringifyInner(value);
  return JSON.stringify(normalized);
}

export function hashPayload(payload: unknown): string {
  // IMPORTANT: use deterministic serialization so cache keys are stable across runs
  // and independent of object insertion order.
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}
