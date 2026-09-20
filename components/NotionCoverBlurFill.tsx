import * as React from "react";

import {
  COVER_IMAGE_SIZES,
  getNotionCoverImage,
} from "@/lib/notion-cover-image";

interface Props {
  coverUrl: string;
  /**
   * Raw Notion page_cover_position value (0–1).
   * react-notion-x converts this as (1 - value) * 100 for CSS object-position.
   * 0 → shows bottom (CSS 100%), 1 → shows top (CSS 0%), 0.5 → center.
   * Default matches react-notion-x's defaultPageCoverPosition = 0.5.
   */
  coverPosition?: number;
}

/**
 * YouTube-style two-layer cover:
 *   - Background: same image, full container width, heavily blurred → fills edge-to-edge
 *   - Foreground: same image, constrained to --notion-max-width, sharp → no stretch/crop
 *
 * Used as the `pageCover` override prop on NotionRenderer so we control both layers
 * from a single React component instead of relying on CSS pseudo-elements.
 */
export function NotionCoverBlurFill({ coverUrl, coverPosition = 0.5 }: Props) {
  // Match react-notion-x formula exactly: (1 - page_cover_position) * 100
  // page_cover_position=0 → 100% (bottom), =1 → 0% (top), =0.5 → 50% (center)
  const objectPosition = `center ${(1 - coverPosition) * 100}%`;

  // Served through the /_next/image optimizer: the raw Notion asset is the
  // untouched original (1.6 MB for one cover) and the band is full-bleed, so a
  // srcSet is what the layout actually wants. Being same-origin, this path is
  // also immune to the firewalls that used to block notion.so directly.
  //
  // `optimized` is null only for sources the optimizer rejects (a local default
  // cover), in which case the upstream URL is used unchanged.
  const optimized = React.useMemo(
    () => getNotionCoverImage(coverUrl),
    [coverUrl],
  );

  // Both layers fall back together so the blurred background can never diverge
  // from the sharp foreground. The background is a CSS url() and cannot report
  // failure on its own, so the foreground <img> speaks for both: if the
  // optimizer itself fails (upstream 403, expired signed URL) both drop to the
  // raw Notion URL, which is where they stood before optimization.
  const [degraded, setDegraded] = React.useState(false);
  const useOptimized = optimized !== null && !degraded;

  React.useEffect(() => {
    setDegraded(false);
  }, [coverUrl]);

  const handleError = React.useCallback(() => {
    setDegraded(true);
  }, []);

  const foregroundSrc = useOptimized ? optimized.src : coverUrl;
  const backgroundSrc = useOptimized ? optimized.backdropSrc : coverUrl;

  return (
    <div className="notion-page-cover-wrapper notion-yt-cover">
      {/* Layer 1 — background: blurred, fills 100% of the cover band */}
      <div
        aria-hidden="true"
        className="notion-yt-cover__bg"
        style={{
          backgroundImage: `url(${JSON.stringify(backgroundSrc)})`,
          backgroundPosition: objectPosition,
        }}
      />

      {/* Layer 2 — foreground: sharp image capped at content column width */}
      <div className="notion-yt-cover__fg" aria-hidden="true">
        <img
          src={foregroundSrc}
          srcSet={useOptimized ? optimized.srcSet : undefined}
          sizes={useOptimized ? COVER_IMAGE_SIZES : undefined}
          alt=""
          className="notion-yt-cover__img"
          style={{ objectPosition }}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onError={handleError}
        />
      </div>
    </div>
  );
}
