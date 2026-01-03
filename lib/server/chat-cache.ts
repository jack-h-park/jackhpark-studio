import { createHash } from "node:crypto";

export type CacheKey = string;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export interface CacheClient {
  get<T>(key: CacheKey): Promise<T | null>;
  set<T>(key: CacheKey, value: T, ttlSeconds: number): Promise<void>;
}

const memoryStore = new Map<CacheKey, CacheEntry<unknown>>();

export const memoryCacheClient: CacheClient = {
  async get<T>(key: CacheKey): Promise<T | null> {
    const entry = memoryStore.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value as T;
  },
  async set<T>(key: CacheKey, value: T, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    memoryStore.set(key, { value, expiresAt });
  },
};

export function clearMemoryCache(): void {
  memoryStore.clear();
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
      for (const key of Object.keys(obj).sort()) {
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
