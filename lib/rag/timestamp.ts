export function normalizeTimestamp(input: unknown): string | null {
  if (!input) {
    return null;
  }

  if (typeof input === "number") {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof input === "string") {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}
