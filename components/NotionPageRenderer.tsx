"use client";
import type { CollectionQueryResult, ExtendedRecordMap } from "notion-types";
import dynamic from "next/dynamic";
import router from "next/router";
import { parsePageId } from "notion-utils";
import * as React from "react";
import ReactModal from "react-modal";
import {
  type MapImageUrlFn,
  type NotionComponents,
  useNotionContext,
} from "react-notion-x";
import { Collection } from "react-notion-x/build/third-party/collection";
import { Equation } from "react-notion-x/build/third-party/equation";
import { Modal } from "react-notion-x/build/third-party/modal";
import { Pdf } from "react-notion-x/build/third-party/pdf";

import { inlineCollectionTitleBold } from "@/lib/config";
import {
  SIDE_PEEK_DISABLED_COLLECTION_BLOCK_IDS,
  SIDE_PEEK_DISABLED_COLLECTION_IDS,
} from "@/lib/side-peek.config";

import { NotionCode } from "./notion-code";

const NotionRenderer = dynamic(
  async () => (await import("react-notion-x")).NotionRenderer,
  { ssr: false },
);

let modalInitialized = false;

const transformInlineTitleBold = (title: any, shouldBold: boolean): any => {
  if (!Array.isArray(title)) {
    return title;
  }

  let changed = false;

  const transformed = title.map((segment) => {
    if (!Array.isArray(segment)) {
      return segment;
    }

    const [text, decorations] = segment as [string, any[] | undefined];

    if (shouldBold) {
      if (!Array.isArray(decorations) || decorations.length === 0) {
        changed = true;
        return [text, [["b"]]];
      }

      const hasBold = decorations.some(
        (decoration) => Array.isArray(decoration) && decoration[0] === "b",
      );

      if (hasBold) {
        return segment;
      }

      changed = true;
      return [text, [...decorations, ["b"]]];
    }

    if (!Array.isArray(decorations) || decorations.length === 0) {
      return segment;
    }

    const filtered = decorations.filter((decoration) => {
      if (!Array.isArray(decoration)) {
        return true;
      }

      return decoration[0] !== "b";
    });

    if (filtered.length === decorations.length) {
      return segment;
    }

    changed = true;
    return filtered.length > 0 ? [text, filtered] : [text];
  });

  return changed ? transformed : title;
};

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

  const sanitizedRecordMap = React.useMemo<ExtendedRecordMap>(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[NotionPageRenderer] sanitizeRecordMap invoked");
    }

    if (!recordMap) {
      return recordMap;
    }

    const views = recordMap.collection_view;
    const collections = recordMap.collection;
    const blocks = recordMap.block;

    let viewsChanged = false;
    let collectionsChanged = false;
    let blocksChanged = false;
    let patchedViews = views;
    let patchedCollections = collections;
    let patchedBlocks = blocks;

    if (collections) {
      for (const [collectionId, collection] of Object.entries(collections)) {
        const collectionValue = collection?.value as Record<string, any> | undefined;
        if (!collectionValue) {
          continue;
        }

        let normalizedCollectionValue = collectionValue;
        let normalizedCollection = collection;
        let shouldPatchCollection = false;

        if (
          (!normalizedCollectionValue.schema ||
            typeof normalizedCollectionValue.schema !== "object") &&
          normalizedCollectionValue.value &&
          typeof normalizedCollectionValue.value === "object"
        ) {
          normalizedCollectionValue = normalizedCollectionValue.value as Record<
            string,
            any
          >;
          normalizedCollection = {
            ...(collection as any),
            value: normalizedCollectionValue,
          } as typeof collection;
          shouldPatchCollection = true;
        }

        const schema =
          normalizedCollectionValue.schema &&
          typeof normalizedCollectionValue.schema === "object"
            ? { ...(normalizedCollectionValue.schema as Record<string, any>) }
            : {};
        if (!schema.title || typeof schema.title !== "object") {
          schema.title = {
            name: "Name",
            type: "title",
          };
          shouldPatchCollection = true;
        }

        if (!shouldPatchCollection) {
          continue;
        }

        if (!collectionsChanged) {
          patchedCollections = { ...collections };
          collectionsChanged = true;
        }

        patchedCollections[collectionId] = {
          ...(normalizedCollection as any),
          value: {
            ...(normalizedCollectionValue as any),
            schema,
          },
        } as typeof collection;
      }
    }

    if (blocks) {
      for (const [blockId, block] of Object.entries(blocks)) {
        const blockValue = block?.value as Record<string, any> | undefined;
        if (!blockValue) {
          continue;
        }

        let normalizedBlockValue = blockValue;
        let normalizedBlock = block;

        // Some malformed recordMaps contain a doubly-wrapped block payload:
        // block.value = { value: { id, type, ... } }
        // react-notion-x expects block.value to be the inner payload directly.
        if (
          (!normalizedBlockValue.type || !normalizedBlockValue.id) &&
          normalizedBlockValue.value &&
          typeof normalizedBlockValue.value === "object" &&
          (normalizedBlockValue.value.type || normalizedBlockValue.value.id)
        ) {
          if (!blocksChanged) {
            patchedBlocks = { ...blocks };
            blocksChanged = true;
          }

          normalizedBlockValue = normalizedBlockValue.value as Record<string, any>;
          normalizedBlock = {
            ...(block as any),
            value: normalizedBlockValue,
          } as typeof block;
          patchedBlocks[blockId] = normalizedBlock;
        }

        // react-notion-x assumes every block has a stable id string.
        // Some merged recordMap entries can miss `value.id`, which crashes
        // inside uuidToId(block.id). Repair with the block map key.
        if (
          (typeof blockValue.id !== "string" || blockValue.id.length === 0) &&
          typeof blockId === "string" &&
          blockId.length > 0
        ) {
          if (!blocksChanged) {
            patchedBlocks = { ...blocks };
            blocksChanged = true;
          }

          normalizedBlockValue = {
            ...(normalizedBlockValue as any),
            id: blockId,
          };
          patchedBlocks[blockId] = {
            ...(normalizedBlock as any),
            value: normalizedBlockValue,
          } as typeof block;
        }

        if (
          normalizedBlockValue.type !== "page" ||
          normalizedBlockValue.parent_table !== "collection"
        ) {
          continue;
        }

        const properties = normalizedBlockValue.properties as
          | Record<string, any>
          | undefined;
        if (!properties) {
          continue;
        }

        const title = properties.title;
        const sanitizedTitle = transformInlineTitleBold(
          title,
          inlineCollectionTitleBold,
        );
        if (sanitizedTitle === title) {
          continue;
        }

        if (!blocksChanged) {
          patchedBlocks = { ...blocks };
          blocksChanged = true;
        }

        const updatedValue = {
          ...(normalizedBlockValue as any),
          properties: { ...(properties as any), title: sanitizedTitle },
        };

        patchedBlocks[blockId] = {
          ...(normalizedBlock as any),
          value: updatedValue,
        } as typeof block;
      }
    }

    if (views) {
      const workingViews = { ...views };
      for (const [viewId, view] of Object.entries(views)) {
        const viewValue = view?.value;

        if (!view || !viewValue || viewValue.type !== "list") {
          continue;
        }

        const format = viewValue.format;

        const listProperties = format?.list_properties;

        if (!Array.isArray(listProperties) || listProperties.length === 0) {
          continue;
        }

        let viewChanged = false;

        const patchedListProperties = listProperties.map((propertyConfig) => {
          if (!propertyConfig || typeof propertyConfig !== "object") {
            return propertyConfig;
          }

          if (propertyConfig.visible === false) {
            return propertyConfig;
          }

          if (propertyConfig.property !== "title") {
            return propertyConfig;
          }

          viewChanged = true;
          return { ...propertyConfig, visible: false };
        });

        if (!viewChanged) {
          continue;
        }

        viewsChanged = true;
        workingViews[viewId] = {
          ...view,
          value: {
            ...viewValue,
            format: {
              ...viewValue.format,
              list_properties: patchedListProperties,
            },
          },
        };
      }

      if (viewsChanged) {
        patchedViews = workingViews;
      }
    }

    if (!blocksChanged && !viewsChanged && !collectionsChanged) {
      return recordMap;
    }

    return {
      ...recordMap,
      ...(blocksChanged ? { block: patchedBlocks! } : {}),
      ...(collectionsChanged ? { collection: patchedCollections! } : {}),
      ...(viewsChanged ? { collection_view: patchedViews! } : {}),
    };
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

  // PageLink
  const components = React.useMemo(
    () => ({
      ...parentComponents,
      Code: NotionCode,
      Collection: CollectionWithDescription,
      Equation,
      Pdf,
      Modal,
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
    [canonicalPageMap, onOpenPeek, parentComponents, sanitizedRecordMap],
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
          />
        ) : null}
      </div>
    </div>
  );
}
