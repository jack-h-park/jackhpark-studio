"use client";

import * as React from "react";

import {
  getNotionImageDelivery,
  inferNotionImageRole,
  type NotionImageRole,
} from "@/lib/notion-image-delivery";

export type NotionImageProps = Omit<
  React.ComponentPropsWithoutRef<"img">,
  "ref"
> & {
  priority?: boolean;
  placeholder?: "blur" | string;
  blurDataURL?: string;
  fill?: boolean;
  /**
   * What this image is for, which is what decides its width ladder. Omitted,
   * it is inferred from the class name — all react-notion-x gives us.
   */
  imageRole?: NotionImageRole;
};

/**
 * Two-stage Notion image loader (see docs/architecture/notion-image-loading.md).
 *
 * Stage 1 — `/_next/image` at a width the surface's layout actually uses.
 * Stage 2 — on error, the Notion-hosted URL, unsized, exactly as before.
 *
 * The stages used to run the other way round, to keep Vercel optimization
 * charges at zero. That traded them for bytes without a ceiling: Notion serves
 * the original, so a 3705px photo shipped whole into a 21px avatar. Stage 1 is
 * also same-origin, which makes it immune to the firewalls that were the
 * reason stage 2 existed in the first place.
 *
 * Stage 2 swaps only `src`/`srcSet`/`sizes`: same element, same classes, same
 * styles, so the fallback can never change page layout. A single retry, then
 * we stop.
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
      imageRole,
      onError,
      onLoad,
      ...rest
    },
    ref,
  ) => {
    const [degraded, setDegraded] = React.useState(false);
    const [isLoaded, setIsLoaded] = React.useState(false);

    // A new src is a new image: drop the degraded flag and the loaded flag
    // resolved for the previous one.
    const lastSrcRef = React.useRef(src);
    if (lastSrcRef.current !== src) {
      lastSrcRef.current = src;
      if (degraded) setDegraded(false);
      if (isLoaded) setIsLoaded(false);
    }

    const role = imageRole ?? inferNotionImageRole(className);
    const delivery = React.useMemo(
      () =>
        typeof src === "string" ? getNotionImageDelivery(src, role) : null,
      [src, role],
    );
    const optimized = delivery !== null && !degraded;

    // The blur placeholder is a background *behind* the image, so it has to go
    // once the image is there — a transparent PNG would otherwise keep showing
    // its own blurred copy through the transparent pixels forever.
    const mergedStyle =
      _placeholder === "blur" && blurDataURL && !isLoaded
        ? {
            ...style,
            backgroundImage: `url(${blurDataURL})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : style;

    const handleLoad = React.useCallback(
      (event: React.SyntheticEvent<HTMLImageElement>) => {
        setIsLoaded(true);
        // react-notion-x attaches medium-zoom here; keep it working.
        onLoad?.(event);
      },
      [onLoad],
    );

    const handleError = React.useCallback(
      (event: React.SyntheticEvent<HTMLImageElement>) => {
        onError?.(event);
        // One retry. Once we are already on the upstream URL the error is
        // final — there is nothing left to fall back to.
        setDegraded(true);
      },
      [onError],
    );

    return (
      <img
        {...rest}
        ref={ref}
        src={optimized ? delivery.src : src}
        srcSet={optimized ? delivery.srcSet : undefined}
        sizes={optimized ? delivery.sizes : undefined}
        alt={alt}
        width={width ?? undefined}
        height={height ?? undefined}
        className={className}
        loading={loading ?? (priority ? "eager" : "lazy")}
        fetchPriority={priority ? "high" : undefined}
        style={mergedStyle}
        // Read by the document-level icon handler in NotionPageRenderer, which
        // must not swap in the default icon while this component still has a
        // stage left to try.
        data-notion-image-retry={optimized ? "pending" : "exhausted"}
        onLoad={handleLoad}
        onError={handleError}
      />
    );
  },
);

NotionImage.displayName = "NotionImage";
