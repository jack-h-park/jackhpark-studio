// Keep this check independent of Notion and sitemap loading: arbitrary scanner
// paths must not start either operation on a cold serverless instance.
export function isSupportedNotionRoute(input: unknown): input is string {
  if (typeof input !== "string" || !/^[a-z0-9][a-z0-9_-]*$/i.test(input)) {
    return false;
  }
  if (["admin", "api", "constructor"].includes(input.toLowerCase())) {
    return false;
  }
  // A UUID-shaped value must have the exact grouping. Ordinary title slugs,
  // including repeated hyphens and UUID suffixes, retain their old behavior.
  if (
    input.includes("-") &&
    input.replaceAll("-", "").length === 32 &&
    /^[a-f0-9-]+$/i.test(input)
  ) {
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      input,
    );
  }
  return true;
}
