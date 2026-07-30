"use client";

import * as React from "react";

import { getNextImageProxyUrl } from "@/lib/next-image-proxy";

export type NotionImageProps = Omit<
  React.ComponentPropsWithoutRef<"img">,
  "ref"
> & {
  priority?: boolean;
  placeholder?: "blur" | string;
  blurDataURL?: string;
  fill?: boolean;
};

/**
 * Two-stage Notion image loader (see docs/architecture/notion-image-loading.md).
 *
 * Stage 1 — the browser fetches the Notion-hosted URL directly (no server cost).
 * Stage 2 — on error (firewall blocking notion.so, expired signed URL) we retry
 * through `/_next/image`, which fetches server-side on the client's behalf.
 *
 * Stage 2 swaps only the `src`: same element, same classes, same styles, so the
 * fallback can never change page layout. A single retry, then we stop.
 */
export const NotionImage = React.forwardRef<HTMLImageElement, NotionImageProps>(
  (
    {
      priority,
      placeholder: _placeholder,
      blurDataURL,
      loading,
      style,
      fill: _fill,
      width,
      height,
      src,
      alt,
      className,
      onError,
      ...rest
    },
    ref,
  ) => {
    const [proxySrc, setProxySrc] = React.useState<string | null>(null);

    // A new src is a new image: drop any proxy URL resolved for the previous one.
    const lastSrcRef = React.useRef(src);
    if (lastSrcRef.current !== src) {
      lastSrcRef.current = src;
      if (proxySrc) setProxySrc(null);
    }

    const mergedStyle =
      _placeholder === "blur" && blurDataURL
        ? {
            ...style,
            backgroundImage: `url(${blurDataURL})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : style;

    const handleError = React.useCallback(
      (event: React.SyntheticEvent<HTMLImageElement>) => {
        onError?.(event);

        // Already on the proxy: the server can't reach the host either, so
        // retrying would loop forever.
        if (proxySrc || typeof src !== "string") return;

        const proxied = getNextImageProxyUrl(
          src,
          event.currentTarget.getBoundingClientRect().width,
        );
        if (proxied) setProxySrc(proxied);
      },
      [onError, proxySrc, src],
    );

    return (
      <img
        {...rest}
        ref={ref}
        src={proxySrc ?? src}
        alt={alt}
        width={width ?? undefined}
        height={height ?? undefined}
        className={className}
        loading={loading ?? (priority ? "eager" : "lazy")}
        fetchPriority={priority ? "high" : undefined}
        style={mergedStyle}
        onError={handleError}
      />
    );
  },
);

NotionImage.displayName = "NotionImage";
