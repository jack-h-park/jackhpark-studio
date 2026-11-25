"use client";
import type {
  Block,
  CollectionQueryResult,
  Decoration,
  ExtendedRecordMap,
} from "notion-types";
import router from "next/router";
import { idToUuid, parsePageId } from "notion-utils";
import * as React from "react";
import { NotionRenderer, Text } from "react-notion-x";

import { defaultPageIcon, isPreviewImageSupportEnabled } from "@/lib/config";
import { retryImageThroughProxy } from "@/lib/next-image-proxy";
import { sanitizeNotionRecordMap } from "@/lib/notion/sanitize-record-map";
import {
  SIDE_PEEK_DISABLED_COLLECTION_BLOCK_IDS,
  SIDE_PEEK_DISABLED_COLLECTION_IDS,
} from "@/lib/side-peek.config";

import type { VendorComponents } from "./notion-vendor-components";
import type { NotionPageRendererProps } from "./NotionPageRenderer";
import { staticFallbackComponents } from "./notion-static-fallbacks";
import { NotionCoverBlurFill } from "./NotionCoverBlurFill";
import { NotionPageHeader } from "./NotionPageHeader";

/**
 * Loads the browser-only block renderers (Prism code, KaTeX, collections,
 * modal, PDF) after hydration. Until then the static fallbacks render, on the
 * server and in the first client render alike, so hydration matches and the
 * server never evaluates the vendor modules.
 */
function useVendorComponents(): VendorComponents | null {
  const [vendor, setVendor] = React.useState<VendorComponents | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void import("./notion-vendor-components").then((module) => {
      if (cancelled) return;
      module.initModalAppElement();
      setVendor(module.vendorComponents);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return vendor;
}

// Server-rendered: crawlers, link unfurlers and other no-JavaScript readers
// must receive the article prose in the HTML itself.
export function NotionPageBody({
  recordMap,
  darkMode,
  fullPage,
  rootPageId,
  canonicalPageMap,
  mapPageUrl,
  mapImageUrl,
  pageAside,
  footer,
  components: parentComponents, // custom components from parent
  onOpenPeek,
  pageId,
}: NotionPageRendererProps) {
  const vendorComponents = useVendorComponents();

  React.useEffect(() => {
    const onImgError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;

      const isIconImage = Boolean(
        target.closest(
          ".notion-page-title-icon, .notion-page-icon-inline, .notion-collection-column-title-icon",
        ),
      );
      if (!isIconImage) return;

      // A failed request is not a missing icon, so nothing here may run while
      // the icon still has a stage to try. NotionImage marks its own elements
      // and owns their optimizer→upstream fallback; this listener sits on the
      // document in the capture phase, so without the check it would reach the
      // element first and pin the default icon over a retry that then
      // succeeds. Anything NotionImage does not render — a library-rendered
      // icon, an icon injected into the DOM — still gets the proxy retry.
      if (target.dataset.notionImageRetry === "pending") return;
      if (!target.dataset.notionImageRetry && retryImageThroughProxy(target)) {
        return;
      }

      if (target.dataset.iconFallbackApplied === "1") return;

      target.dataset.iconFallbackApplied = "1";

      if (defaultPageIcon && !target.src.includes(defaultPageIcon)) {
        target.src = defaultPageIcon;
      } else {
        target.style.display = "none";
      }
    };

    document.addEventListener("error", onImgError, true);
    return () => {
      document.removeEventListener("error", onImgError, true);
    };
  }, []);

  const sanitizedRecordMap = React.useMemo<ExtendedRecordMap>(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[NotionPageRenderer] sanitizeRecordMap invoked");
    }

    return sanitizeNotionRecordMap(recordMap);
  }, [recordMap]);

  // The studio home carries a hero row and galleries rather than prose, so it
  // gets its own reading-column width on wide viewports (`.index-page` in
  // styles/notion-parity.css). Page ids reach this component both with and
  // without dashes, so compare them stripped.
  const isRootPage = React.useMemo(() => {
    if (!pageId || !rootPageId) return false;
    const normalize = (id: string) => id.replaceAll("-", "").toLowerCase();
    return normalize(pageId) === normalize(rootPageId);
  }, [pageId, rootPageId]);

  React.useEffect(() => {
    if (!recordMap?.collection_view) {
      console.log("[CollectionDebug] no collection views present");
      return;
    }

    for (const [viewId, view] of Object.entries(recordMap.collection_view)) {
      const viewValue = view?.value;
      if (!viewValue) {
        console.log("[CollectionDebug] missing view value", { viewId });
        continue;
      }

      const collectionId: string | undefined = (
        viewValue as { collection_id?: string }
      ).collection_id;
      const queryEntry =
        collectionId && recordMap.collection_query?.[collectionId]?.[viewId];

      const format = viewValue.format ?? {};
      const collectionGroups = format?.collection_groups;
      const boardColumns = format?.board_columns;
      const groupBy = format?.collection_group_by ?? format?.board_columns_by;

      const queryResult =
        typeof queryEntry === "object" && queryEntry !== null
          ? (queryEntry as CollectionQueryResult)
          : null;

      const reducerResults =
        queryResult &&
        queryResult.reducerResults &&
        typeof queryResult.reducerResults === "object"
          ? (queryResult.reducerResults as Record<string, unknown>)
          : null;

      const blockIdsLength = queryResult?.blockIds?.length ?? null;

      console.log("[CollectionDebug] view snapshot", {
        viewId,
        collectionId,
        viewType: viewValue.type,
        hasGrouping: Boolean(groupBy) || Boolean(collectionGroups),
        groupBy,
        collectionGroupsLength: Array.isArray(collectionGroups)
          ? collectionGroups.length
          : 0,
        boardColumnsLength: Array.isArray(boardColumns)
          ? boardColumns.length
          : 0,
        queryKeys: queryResult ? Object.keys(queryResult) : null,
        reducerKeys: reducerResults ? Object.keys(reducerResults) : null,
        resultsBuckets: reducerResults
          ? Object.entries(reducerResults)
              .filter(([key, value]: [string, unknown]) => {
                const blockIds = (value as { blockIds?: unknown[] } | null)
                  ?.blockIds;
                return (
                  key.startsWith("results:") && Boolean(blockIds?.length ?? 0)
                );
              })
              .map(([key, value]: [string, unknown]) => ({
                key,
                count:
                  (value as { blockIds?: unknown[] } | null)?.blockIds
                    ?.length ?? 0,
              }))
          : null,
        fallbackBlockIdsLength: blockIdsLength,
      });
    }
  }, [recordMap]);

  // YouTube-style two-layer cover (blurred background + sharp constrained foreground).
  // Only renders when the page block has a cover image; falls back to react-notion-x default otherwise.
  const pageCoverNode = React.useMemo<React.ReactNode>(() => {
    if (!pageId || !mapImageUrl) return undefined;

    // recordMap.block keys use UUID format (with dashes); pageId from the URL may lack them.
    const blockId =
      sanitizedRecordMap.block[pageId] != null ? pageId : idToUuid(pageId);
    const pageBlock = sanitizedRecordMap.block[blockId]?.value;
    if (!pageBlock) return undefined;

    // page_cover lives on the block format; notion-types does not declare it
    // on every block variant this renderer may receive.
    const blockFormat = (
      pageBlock as { format?: Record<string, unknown> } | undefined
    )?.format;
    const rawCoverUrl =
      typeof blockFormat?.page_cover === "string"
        ? blockFormat.page_cover
        : undefined;
    if (!rawCoverUrl) return undefined;

    const coverUrl = mapImageUrl(rawCoverUrl, pageBlock);
    if (!coverUrl) return undefined;

    const coverPosition =
      typeof blockFormat?.page_cover_position === "number"
        ? blockFormat.page_cover_position
        : 0.5;

    return (
      <NotionCoverBlurFill coverUrl={coverUrl} coverPosition={coverPosition} />
    );
  }, [pageId, sanitizedRecordMap, mapImageUrl]);

  // PageLink
  // Notion select/multi_select values that don't match any schema option are stray
  // data that Notion silently hides. Skip rendering them to match Notion's behavior.
  const propertySelectValue = React.useCallback(
    (props: { option?: unknown }, defaultRenderer: () => React.ReactNode) => {
      if (!props?.option) return null;
      return defaultRenderer();
    },
    [],
  );

  // Notion relation fields can contain stray plain-text segments that the Notion
  // app silently hides but react-notion-x renders verbatim. This override keeps
  // only the page-reference (‣) segments so only the actual linked entries show.
  const propertyRelationValue = React.useCallback(
    (
      // react-notion-x always supplies block to a property renderer; Text
      // requires it, and the previous `any` was hiding that it could be missing.
      props: { data?: Decoration[]; block: Block },
      defaultRenderer: () => React.ReactNode,
    ) => {
      const data = props?.data;
      if (!Array.isArray(data)) return defaultRenderer();

      const pageRefOnly = data.filter((segment: Decoration) => {
        if (!Array.isArray(segment) || segment[0] !== "‣") return false;
        const decorators = segment[1];
        return (
          Array.isArray(decorators) &&
          decorators.some(
            (d: unknown) => Array.isArray(d) && (d[0] === "r" || d[0] === "p"),
          )
        );
      });

      if (pageRefOnly.length === 0) return defaultRenderer();
      return <Text value={pageRefOnly} block={props.block} />;
    },
    [],
  );

  const components = React.useMemo(
    () => ({
      Header: NotionPageHeader,
      ...parentComponents,
      ...(vendorComponents ?? staticFallbackComponents),
      propertySelectValue,
      propertyRelationValue,
      PageLink: ({
        href,
        children,
        className,
        ...props
      }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (!href) {
          return (
            <a className={className} {...props}>
              {children}
            </a>
          );
        }

        const isExternal =
          href.startsWith("http://") || href.startsWith("https://");
        const pageId =
          parsePageId(href) ||
          canonicalPageMap?.[href.replaceAll(/^\/+|\/+$/g, "")];

        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();

          console.log("[PageLink clicked]", href);
          console.log("canonicalPageMap?", canonicalPageMap);
          console.log("onOpenPeek callback exists?", !!onOpenPeek);
          console.log("onOpenPeek pageId?", pageId);

          // Identify the inline collection element (if any) that owns this link
          const element = e.currentTarget as HTMLElement;
          const collectionElement = element.closest(
            ".notion-collection",
          ) as HTMLElement | null;

          const closestDataBlockElement = collectionElement
            ? (collectionElement.closest(
                "[data-block-id]",
              ) as HTMLElement | null)
            : null;

          const inlineCollectionBlockId = collectionElement
            ? (collectionElement.dataset?.blockId ??
              closestDataBlockElement?.dataset?.blockId ??
              Array.from(collectionElement.classList ?? [])
                .find((className) => className.startsWith("notion-block-"))
                ?.replace("notion-block-", "") ??
              null)
            : null;

          const normalizedCollectionBlockId = inlineCollectionBlockId
            ? inlineCollectionBlockId.replaceAll("-", "")
            : null;

          const isInlineDBLink = !!collectionElement;

          const parentCollectionId = pageId
            ? sanitizedRecordMap?.block?.[pageId]?.value?.parent_id
            : null;

          const normalizedParentCollectionId = parentCollectionId
            ? parentCollectionId.replaceAll("-", "")
            : null;

          const shouldBypassSidePeek =
            (normalizedParentCollectionId &&
              SIDE_PEEK_DISABLED_COLLECTION_IDS.has(
                normalizedParentCollectionId,
              )) ||
            (normalizedCollectionBlockId &&
              SIDE_PEEK_DISABLED_COLLECTION_BLOCK_IDS.has(
                normalizedCollectionBlockId,
              ));

          // Inline DB links trigger Side Peek unless the collection opts out
          if (isInlineDBLink && pageId && onOpenPeek && !shouldBypassSidePeek) {
            onOpenPeek(pageId);
            return;
          }

          if (isExternal) {
            window.open(href, "_blank");
            return;
          }

          void router.push(href);
        };

        return (
          <a href={href} className={className} {...props} onClick={handleClick}>
            {children}
          </a>
        );
      },
    }),
    [
      canonicalPageMap,
      onOpenPeek,
      parentComponents,
      propertyRelationValue,
      propertySelectValue,
      sanitizedRecordMap,
      vendorComponents,
    ],
  );

  return (
    <NotionRenderer
      recordMap={sanitizedRecordMap}
      darkMode={darkMode}
      fullPage={fullPage}
      rootPageId={rootPageId}
      bodyClassName={isRootPage ? "index-page" : undefined}
      mapPageUrl={mapPageUrl}
      mapImageUrl={mapImageUrl}
      pageAside={pageAside}
      footer={footer}
      components={components}
      pageCover={pageCoverNode}
      forceCustomImages={true}
      // Same flag that makes the server build `recordMap.preview_images`.
      // Without it react-notion-x defaults to false and never reads the
      // blur data, so the whole pipeline runs for nothing.
      previewImages={isPreviewImageSupportEnabled}
    />
  );
}
