/**
 * How a Notion-hosted image is delivered to the browser.
 *
 * Notion serves the untouched original at every surface, and the mismatch is
 * not marginal. Measured on `/studio`: a 3705px photo rendered into a 21px
 * avatar (1,368 kB), a 900px icon into a 22px box (1,093 kB), 2354px
 * screenshots into 269px cards (1,032 kB). Six images accounted for ~5.2 MB.
 *
 * Each surface here declares a role instead of a pixel width, because the role
 * is what the layout guarantees: an icon is small wherever it appears, a card
 * cover is bounded by the grid, body copy is bounded by the reading column.
 * The optimizer never upscales, so the top of a ladder costs nothing extra on
 * a small source — it just returns the source size.
 *
 * `lib/notion-cover-image.ts` covers the one role not listed here: the
 * full-bleed page cover band, which also needs a blurred backdrop variant and
 * feeds a preload hint, and so keeps its own module.
 */

import {
  getNextImageUrlForWidth,
  type NextImageWidth,
} from "./next-image-proxy";

export type NotionImageRole = "icon" | "card-cover" | "content";

export interface NotionImageDelivery {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/**
 * Icons get one width rather than a ladder. They appear at anything from 16px
 * inline to ~78px in the page header, and 256 covers the largest of those at
 * 3x — for the 1,093 kB avatar that is still roughly two orders of magnitude
 * smaller. Splitting the role further would buy kilobytes and cost a branch
 * at every call site.
 */
const ICON_WIDTH: NextImageWidth = 256;

/**
 * Cards are bounded by the gallery grid (~269px measured at a 770px viewport)
 * and go full-bleed on a phone.
 */
const CARD_COVER_WIDTHS: NextImageWidth[] = [384, 640, 828];
const CARD_COVER_SIZES = "(max-width: 640px) 100vw, 360px";

/**
 * Body images are bounded by `--notion-max-width` (720px). The ladder runs
 * well past that on purpose: these are the images medium-zoom opens
 * full-screen, so the retina rung has to stay close to the source. Even that
 * rung is ~20x smaller than the original — the AVIF conversion, not the
 * downscale, is where most of the saving comes from.
 */
const CONTENT_WIDTHS: NextImageWidth[] = [828, 1200, 1920];
const CONTENT_SIZES = "(max-width: 768px) 100vw, 720px";

const QUALITY = 75;

/** Widest rung, so a browser ignoring srcSet is never handed a soft image. */
function buildLadder(
  src: string,
  widths: NextImageWidth[],
): NotionImageDelivery | null {
  const descriptors: string[] = [];
  for (const width of widths) {
    const url = getNextImageUrlForWidth(src, width, QUALITY);
    if (!url) return null;
    descriptors.push(`${url} ${width}w`);
  }

  const fallback = getNextImageUrlForWidth(
    src,
    widths.at(-1) as NextImageWidth,
    QUALITY,
  );
  if (!fallback) return null;

  return { src: fallback, srcSet: descriptors.join(", ") };
}

/**
 * `null` when the optimizer cannot serve this source — a relative asset, a
 * `data:` URI, a URL that is already proxied. The caller then renders the
 * upstream URL unchanged, which is what every surface did before.
 */
export function getNotionImageDelivery(
  src: string,
  role: NotionImageRole,
): NotionImageDelivery | null {
  if (role === "icon") {
    const url = getNextImageUrlForWidth(src, ICON_WIDTH, QUALITY);
    return url ? { src: url } : null;
  }

  const widths = role === "card-cover" ? CARD_COVER_WIDTHS : CONTENT_WIDTHS;
  const ladder = buildLadder(src, widths);
  if (!ladder) return null;

  return {
    ...ladder,
    sizes: role === "card-cover" ? CARD_COVER_SIZES : CONTENT_SIZES,
  };
}

/**
 * react-notion-x hands every image through one `components.Image` seam, so the
 * class name it assigns is the only thing distinguishing an icon from body
 * copy there. Surfaces this repo renders itself pass their role explicitly
 * instead of relying on this.
 *
 * Matched as a whole class token, not a substring: `notion-page-icon-inline`
 * and `notion-page-icon-image` are the names of the *wrapper* around an inline
 * icon, and a wrapper is not what gets the icon's width ladder.
 */
export function inferNotionImageRole(
  className: string | undefined,
): NotionImageRole {
  const tokens = className?.split(/\s+/);
  return tokens?.includes("notion-page-icon") ? "icon" : "content";
}
