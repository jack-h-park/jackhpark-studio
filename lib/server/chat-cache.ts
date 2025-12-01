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

export function hashPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}
