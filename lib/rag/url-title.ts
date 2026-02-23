export function deriveTitleFromUrl(
  sourceUrl?: string | null,
): string | undefined {
  if (!sourceUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const tail = segments.slice(-2).join(" / ");
    return tail || parsed.hostname;
  } catch {
    return undefined;
  }
}
