/**
 * Delivery variants for a Notion page cover.
 *
 * Notion serves the untouched original: the cover on a detail page was a
 * 1.6 MB PNG rendered into a 270px-tall band. The band is full-bleed
 * (`sizes="100vw"`), so the browser can pick a width if we hand it a srcSet —
 * which `next/image` cannot do here, for the reason documented in
 * `next-image-proxy.ts`: react-notion-x hands custom Image components
 * `width: null, height: null`, so a `next/image` fallback would have to run in
 * `fill` mode and collapse inside Notion's unsized wrappers.
 *
 * Both the preload hint in `PageHead` and the cover itself derive their URLs
 * from here. If the two ever diverge the preload fetches bytes nothing uses,
 * which is strictly worse than not preloading at all.
 *
 * Environment asymmetry, verified 2026-09-20: Vercel's optimizer fetches
 * www.notion.so fine (fresh transforms of several covers all returned 200),
 * but `next dev`'s built-in optimizer is Node fetch, and Node fetch is exactly
 * what `notion-image-fetch.ts` documents notion.so's bot filter answering with
 * a 403 — the optimizer sends no user-agent we can configure. So locally every
 * cover falls back to the raw upstream URL through NotionCoverBlurFill's
 * onError. That is the degraded path working as designed, not a regression;
 * measure the optimized sizes against a deployment, never against `next dev`.
 */

import { getNextImageUrlForWidth } from "./next-image-proxy";

/**
 * Widths offered to the browser. The optimizer never upscales, so a request
 * above the source's own width just returns the source size — harmless as the
 * top of the ladder, wasteful as a fixed choice.
 */
const COVER_WIDTHS = [828, 1080, 1200, 1920] as const;

/** The cover carries display type, where ringing shows up first. */
const COVER_QUALITY = 75;

/**
 * What a browser that ignores `srcSet` gets, and what the preload `href` names.
 * The desktop 1x choice rather than the widest entry: the ladder's top exists
 * for retina, and handing it to a phone would undo the point of the ladder.
 */
const COVER_DEFAULT_WIDTH = 1200;

/**
 * The backdrop layer is blurred by 32px before anyone sees it, so resolution
 * and quality are both wasted on it.
 */
const COVER_BACKDROP_WIDTH = 640;
const COVER_BACKDROP_QUALITY = 50;

/** The band spans the viewport at every breakpoint. */
export const COVER_IMAGE_SIZES = "100vw";

export interface NotionCoverImage {
  /** Fallback for browsers that ignore `srcSet`, and the preload `href`. */
  src: string;
  srcSet: string;
  /** Small, heavily compressed variant for the blurred backdrop layer. */
  backdropSrc: string;
}

/**
 * `null` when the optimizer cannot serve this URL (a local default cover, an
 * already-proxied URL). Callers fall back to the upstream URL unchanged.
 */
export function getNotionCoverImage(coverUrl: string): NotionCoverImage | null {
  const src = getNextImageUrlForWidth(
    coverUrl,
    COVER_DEFAULT_WIDTH,
    COVER_QUALITY,
  );
  const backdropSrc = getNextImageUrlForWidth(
    coverUrl,
    COVER_BACKDROP_WIDTH,
    COVER_BACKDROP_QUALITY,
  );
  if (!src || !backdropSrc) return null;

  const descriptors: string[] = [];
  for (const width of COVER_WIDTHS) {
    const url = getNextImageUrlForWidth(coverUrl, width, COVER_QUALITY);
    // Unreachable once `src` resolved — the answer depends on the URL, not the
    // width — but the ladder must never ship a partial srcSet.
    if (!url) return null;
    descriptors.push(`${url} ${width}w`);
  }

  return { src, srcSet: descriptors.join(", "), backdropSrc };
}
