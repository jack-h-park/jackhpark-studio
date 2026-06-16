"use client";
import type { CollectionQueryResult, ExtendedRecordMap } from "notion-types";
import dynamic from "next/dynamic";
import router from "next/router";
import { idToUuid, parsePageId } from "notion-utils";
import * as React from "react";
import ReactModal from "react-modal";
import {
  type MapImageUrlFn,
  type NotionComponents,
  Text,
  useNotionContext,
} from "react-notion-x";
import { Collection } from "react-notion-x/build/third-party/collection";
import { Equation } from "react-notion-x/build/third-party/equation";
import { Modal } from "react-notion-x/build/third-party/modal";

import { defaultPageIcon } from "@/lib/config";
import { sanitizeNotionRecordMap } from "@/lib/notion/sanitize-record-map";
import {
  SIDE_PEEK_DISABLED_COLLECTION_BLOCK_IDS,
  SIDE_PEEK_DISABLED_COLLECTION_IDS,
} from "@/lib/side-peek.config";

import { NotionCode } from "./notion-code";
import { NotionCoverBlurFill } from "./NotionCoverBlurFill";

const NotionRenderer = dynamic(
  async () => (await import("react-notion-x")).NotionRenderer,
  { ssr: false },
);

const Pdf = dynamic(
  () => import("react-notion-x/build/third-party/pdf").then((m) => m.Pdf),
  { ssr: false },
);

let modalInitialized = false;

function CollectionWithDescription(props: any) {
  const { recordMap, components } = useNotionContext();
  const collectionId = props.block?.collection_id;
  const collection = recordMap?.collection?.[collectionId]?.value as any;
  const description = collection?.description;
  const Text = (components as any).Text;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const descRef = React.useRef<HTMLDivElement>(null);

  // 1. If no description, render original Collection to preserve layout
  if (!description) {
    return <Collection {...props} />;
  }

  // 2. If description exists, inject it after the header via DOM manipulation

  React.useEffect(() => {
    const container = containerRef.current;
    const desc = descRef.current;
    if (!container || !desc) return;

    const collectionEl = container.querySelector(".notion-collection");
    if (!collectionEl) return;

    // Standard Notion Structure: header -> view
    const header = collectionEl.querySelector(".notion-collection-header");

    if (header) {
      if (header.nextSibling !== desc) {
        header.after(desc);
      }
    } else {
      // Fallback: prepend if no header found
      if (collectionEl.firstChild !== desc) {
        collectionEl.prepend(desc);
      }
    }

    desc.style.display = "block";
  }, [description]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <div
        ref={descRef}
        className="notion-collection-description"
        style={{ display: "none", marginTop: "0.5em", marginBottom: "1em" }}
      >
        {Text ? (
          <Text value={description} block={props.block} />
        ) : (
          <span>{JSON.stringify(description)}</span>
        )}
      </div>
      <Collection {...props} />
    </div>
  );
}

interface NotionPageRendererProps {
  recordMap: ExtendedRecordMap;
  darkMode?: boolean;
  fullPage?: boolean;
  rootPageId?: string;
  canonicalPageMap?: Record<string, string>;
  mapPageUrl?: (id: string) => string;
  mapImageUrl?: MapImageUrlFn;
  pageAside?: React.ReactNode;
  footer?: React.ReactNode;
  components?: Partial<NotionComponents>; // custom components from parent
  onOpenPeek?: (pageId: string) => void; // side peek callback
  pageId?: string | null;
  showCustomHeader?: boolean;
}

export function NotionPageRenderer({
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
  showCustomHeader,
}: NotionPageRendererProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));

    if (typeof window !== "undefined" && !modalInitialized) {
      const el = document.querySelector(".notion-frame") || document.body;
      ReactModal.setAppElement(el as HTMLElement);
      modalInitialized = true;
    }

    return () => cancelAnimationFrame(timer);
  }, []);

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

  const hasCustomHeader = Boolean(recordMap && pageId && showCustomHeader);

  React.useEffect(() => {
    if (!recordMap?.collection_view) {
      console.log("[CollectionDebug] no collection views present");
      return;
    }

    for (const [viewId, view] of Object.entries(recordMap.collection_view)) {
      const viewValue: any = view?.value;
      if (!viewValue) {
        console.log("[CollectionDebug] missing view value", { viewId });
        continue;
      }

      const collectionId: string | undefined = viewValue.collection_id;
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
          ? (queryResult.reducerResults as Record<string, any>)
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
              .filter(([key, value]: [string, any]) => {
                return (
                  key.startsWith("results:") &&
                  Boolean(value?.blockIds?.length ?? 0)
                );
              })
              .map(([key, value]: [string, any]) => ({
                key,
                count: value?.blockIds?.length ?? 0,
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

    const rawCoverUrl = (pageBlock as any).format?.page_cover as
      | string
      | undefined;
    if (!rawCoverUrl) return undefined;

    const coverUrl = mapImageUrl(rawCoverUrl, pageBlock as any);
    if (!coverUrl) return undefined;

    const coverPosition =
      ((pageBlock as any).format?.page_cover_position as number | undefined) ??
      0.5;

    return (
      <NotionCoverBlurFill coverUrl={coverUrl} coverPosition={coverPosition} />
    );
  }, [pageId, sanitizedRecordMap, mapImageUrl]);

  // PageLink
  // Notion select/multi_select values that don't match any schema option are stray
  // data that Notion silently hides. Skip rendering them to match Notion's behavior.
  const propertySelectValue = React.useCallback(
    (props: any, defaultRenderer: () => React.ReactNode) => {
      if (!props?.option) return null;
      return defaultRenderer();
    },
    [],
  );

  // Notion relation fields can contain stray plain-text segments that the Notion
  // app silently hides but react-notion-x renders verbatim. This override keeps
  // only the page-reference (‣) segments so only the actual linked entries show.
  const propertyRelationValue = React.useCallback(
    (props: any, defaultRenderer: () => React.ReactNode) => {
      const data: unknown = props?.data;
      if (!Array.isArray(data)) return defaultRenderer();

      const pageRefOnly = data.filter((segment: unknown) => {
        if (!Array.isArray(segment) || segment[0] !== "‣") return false;
        const decorators = segment[1];
        return (
          Array.isArray(decorators) &&
          decorators.some(
            (d: unknown) =>
              Array.isArray(d) && (d[0] === "r" || d[0] === "p"),
          )
        );
      });

      if (pageRefOnly.length === 0) return defaultRenderer();
      return <Text value={pageRefOnly as any} block={props.block} />;
    },
    [],
  );

  const components = React.useMemo(
    () => ({
      ...parentComponents,
      Code: NotionCode,
      Collection: CollectionWithDescription,
      Equation,
      Pdf,
      Modal,
      propertySelectValue,
      propertyRelationValue,
      PageLink: ({ href, children, className, ...props }: any) => {
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
    [canonicalPageMap, onOpenPeek, parentComponents, propertyRelationValue, propertySelectValue, sanitizedRecordMap],
  );

  //NotionRendereer
  const wrapperClassName = hasCustomHeader
    ? "notion-wrapper has-custom-header-props"
    : "notion-wrapper";

  return (
    <div className={wrapperClassName}>
      <div className="notion-frame">
        {mounted ? (
          <NotionRenderer
            recordMap={sanitizedRecordMap}
            darkMode={darkMode}
            fullPage={fullPage}
            rootPageId={rootPageId}
            mapPageUrl={mapPageUrl}
            mapImageUrl={mapImageUrl}
            pageAside={pageAside as any}
            footer={footer as any}
            components={components}
            pageCover={pageCoverNode as any}
            forceCustomImages={true}
          />
        ) : null}
      </div>
    </div>
  );
}
