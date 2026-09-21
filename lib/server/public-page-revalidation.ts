export type PublicPageRevalidationTarget = { path: string };

export function resolvePublicPageRevalidationTarget(
  input: unknown,
  canonicalPageMap: Record<string, string>,
): PublicPageRevalidationTarget | null {
  if (input === "/studio") return { path: "/studio" };
  if (
    typeof input !== "string" ||
    !/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(input)
  ) {
    return null;
  }

  const slug = input.slice(1).toLowerCase();
  if (slug === "admin" || slug === "api") return null;

  const pageId = canonicalPageMap[slug];
  return Object.hasOwn(canonicalPageMap, slug) &&
    typeof pageId === "string" &&
    pageId.trim().length > 0
    ? { path: `/${slug}` }
    : null;
}
