import * as React from "react";

interface Props {
  coverUrl: string;
  /**
   * Vertical focal point from 0 (top) to 1 (bottom).
   * Notion stores this as page_cover_position. Default is 0.5 (center).
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
  const objectPosition = `center ${coverPosition * 100}%`;

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
