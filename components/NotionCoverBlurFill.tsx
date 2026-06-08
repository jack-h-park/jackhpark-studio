import * as React from "react";

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

  return (
    <div className="notion-page-cover-wrapper notion-yt-cover">
      {/* Layer 1 — background: blurred, fills 100% of the cover band */}
      <div
        aria-hidden="true"
        className="notion-yt-cover__bg"
        style={{
          backgroundImage: `url(${JSON.stringify(coverUrl)})`,
          backgroundPosition: objectPosition,
        }}
      />

      {/* Layer 2 — foreground: sharp image capped at content column width */}
      <div className="notion-yt-cover__fg" aria-hidden="true">
        <img
          src={coverUrl}
          alt=""
          className="notion-yt-cover__img notion-page-cover"
          style={{ objectPosition }}
          loading="eager"
          decoding="async"
        />
      </div>
    </div>
  );
}
