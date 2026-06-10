/**
 * Single-value TTL cache used by the settings loaders. Replaces the four
 * hand-rolled `cachedX` / `cachedXAt` module-variable pairs that previously
 * lived in chat-settings.ts.
 */
export class TtlCache<T> {
  private value: T | null = null;
  private storedAt = 0;

  constructor(private readonly ttlMs: number) {}

  get(): T | null {
    if (this.value === null) {
      return null;
    }
    if (Date.now() - this.storedAt >= this.ttlMs) {
      return null;
    }
    return this.value;
  }

  set(value: T): T {
    this.value = value;
    this.storedAt = Date.now();
    return value;
  }

  clear(): void {
    this.value = null;
    this.storedAt = 0;
  }
}
