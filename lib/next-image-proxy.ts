/**
 * Server-side image proxy URLs for environments where the browser cannot reach
 * the image host directly (e.g. corporate firewalls that block `notion.so`).
 *
 * We build the `/_next/image` URL by hand instead of rendering `next/image`.
 * react-notion-x hands custom `Image` components `width: null, height: null`,
 * so a `next/image` fallback would always have to run in `fill` mode — which
 * makes the element `position: absolute` and collapses it to zero height inside
 * Notion's unsized wrappers. A plain `<img>` pointed at the same optimizer
 * endpoint keeps the original layout untouched.
 */

// Must stay in sync with `images.imageSizes` + `images.deviceSizes` in
// `next.config.js`. Neither is set there, so these are the Next.js defaults;
// the optimizer rejects (400) any `w` outside this list.
const NEXT_IMAGE_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
  3840,
] as const;

const DEFAULT_WIDTH = 1080;
// Ceiling on the requested variant: the fallback is a degraded path, not a
// reason to make the optimizer produce 3840px renditions of every cover.
const MAX_WIDTH = 2048;
const QUALITY = 75;

/**
 * @param renderedWidth CSS pixel width of the element the image renders into.
 *   Zero/undefined (never laid out, `display: none`) falls back to a mid-size
 *   bucket rather than requesting the largest variant.
 */
export function getNextImageProxyUrl(
  src: string,
  renderedWidth?: number,
): string | null {
  if (!/^https?:\/\//i.test(src)) {
    // data:, blob: and same-origin assets are never blocked, and the optimizer
    // rejects them anyway.
    return null;
  }

  if (src.includes("/_next/image?")) {
    // Already proxied (possibly as an absolute same-origin URL): the server
    // can't reach the host either, so there is nothing left to try.
    return null;
  }

  const dpr =
    typeof window === "undefined"
      ? 1
      : Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  const target = Math.min(Math.ceil((renderedWidth ?? 0) * dpr), MAX_WIDTH);
  const width =
    target > 0
      ? (NEXT_IMAGE_WIDTHS.find((candidate) => candidate >= target) ??
        MAX_WIDTH)
      : DEFAULT_WIDTH;

  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${QUALITY}`;
}
