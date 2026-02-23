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

import { defaultPageIcon } from "@/lib/config";
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

    if (!recordMap) {
      return recordMap;
    }

    const collections = recordMap.collection;
    const views = recordMap.collection_view;
    const blocks = recordMap.block;

    let collectionsChanged = false;
    let viewsChanged = false;
    let blocksChanged = false;
    let patchedCollections = collections;
    let patchedViews = views;
    let patchedBlocks = blocks;
    const getIdAliases = (id?: string | null): string[] => {
      if (typeof id !== "string" || id.length === 0) return [];
      const aliases = new Set<string>();
      aliases.add(id);
      aliases.add(id.replaceAll("-", ""));
      return Array.from(aliases).filter((alias) => alias.length > 0);
    };
    const getGroupedBucketKeys = (entry: any): string[] => {
      if (!entry || typeof entry !== "object") return [];

      const sources: Array<Record<string, any>> = [];
      if (entry && typeof entry === "object") {
        sources.push(entry as Record<string, any>);
      }
      if (entry.reducerResults && typeof entry.reducerResults === "object") {
        sources.push(entry.reducerResults as Record<string, any>);
      }
      if (entry.reducers && typeof entry.reducers === "object") {
        sources.push(entry.reducers as Record<string, any>);
      }

      const seen = new Set<string>();
      const keys: string[] = [];
      for (const source of sources) {
        for (const key of Object.keys(source)) {
          if (!key.startsWith("results:")) continue;
          if (seen.has(key)) continue;
          seen.add(key);
          keys.push(key);
        }
      }
      return keys;
    };
    const buildGroupsFromBucketKeys = (
      bucketKeys: string[],
      property: string,
    ): Array<Record<string, any>> => {
      return bucketKeys
        .map((bucketKey) => {
          const [, type = "text", ...labelParts] = bucketKey.split(":");
          const label = labelParts.join(":");
          if (!type || !label) return null;
          return {
            property,
            hidden: false,
            value: {
              type,
              value: label === "uncategorized" ? undefined : label,
            },
          };
        })
        .filter(Boolean) as Array<Record<string, any>>;
    };

    if (collections) {
      for (const [collectionId, collection] of Object.entries(collections)) {
        const collectionValue = collection?.value as
          | Record<string, any>
          | undefined;
        if (!collectionValue) {
          continue;
        }

        let normalizedCollectionValue = collectionValue;
        let normalizedCollection = collection;
        let shouldPatchCollection = false;

        // Some recordMaps contain nested wrappers like value.value.value...
        // Unwrap until schema is found (or until safety cap).
        let unwrapDepth = 0;
        while (
          unwrapDepth < 4 &&
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
          unwrapDepth += 1;
        }

        const schema =
          normalizedCollectionValue.schema &&
          typeof normalizedCollectionValue.schema === "object"
            ? { ...(normalizedCollectionValue.schema as Record<string, any>) }
            : {};

        // react-notion-x table expects a title schema entry.
        const hasTitleSchema = Object.values(schema).some(
          (entry: any) => entry?.type === "title",
        );
        if (!hasTitleSchema) {
          schema.title = {
            name: "Name",
            type: "title",
          };
          shouldPatchCollection = true;
        }

        if (
          normalizedCollectionValue.schema !== schema ||
          normalizedCollectionValue.schema == null
        ) {
          shouldPatchCollection = true;
        }

        if (!shouldPatchCollection) {
          continue;
        }

        if (!collectionsChanged) {
          patchedCollections = { ...collections };
          collectionsChanged = true;
        }

        const nextCollectionEntry = {
          ...(normalizedCollection as any),
          value: {
            ...(normalizedCollectionValue as any),
            schema,
          },
        } as typeof collection;
        patchedCollections[collectionId] = nextCollectionEntry;

        for (const aliasId of getIdAliases(normalizedCollectionValue.id)) {
          if (aliasId === collectionId) continue;
          if (patchedCollections[aliasId]) continue;
          patchedCollections[aliasId] = nextCollectionEntry;
        }
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

          normalizedBlockValue = normalizedBlockValue.value as Record<
            string,
            any
          >;
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

        const nextBlockEntry = {
          ...(normalizedBlock as any),
          value: normalizedBlockValue,
        } as typeof block;

        for (const aliasId of getIdAliases(normalizedBlockValue.id)) {
          if (aliasId === blockId) continue;
          if (patchedBlocks?.[aliasId]) continue;
          if (!blocksChanged) {
            patchedBlocks = { ...blocks };
            blocksChanged = true;
          }
          patchedBlocks[aliasId] = nextBlockEntry;
        }
      }
    }

    if (views) {
      const workingViews = { ...views };
      for (const [viewId, view] of Object.entries(views)) {
        let viewValue = view?.value as any;
        let viewChanged = false;

        // Some recordMaps wrap collection views like value.value.value...
        // Unwrap until a stable payload (type/format) is found.
        let unwrapDepth = 0;
        while (
          unwrapDepth < 4 &&
          viewValue &&
          typeof viewValue === "object" &&
          viewValue.value &&
          typeof viewValue.value === "object" &&
          (!viewValue.format || !viewValue.type)
        ) {
          viewValue = viewValue.value;
          viewChanged = true;
          unwrapDepth += 1;
        }

        const format = viewValue?.format as Record<string, any> | undefined;
        if (!format || typeof format !== "object") {
          const nextViewEntry = {
            ...(view as any),
            value: viewValue,
          } as any;
          if (viewChanged) {
            viewsChanged = true;
            workingViews[viewId] = nextViewEntry;
          }

          for (const aliasId of getIdAliases(viewValue?.id)) {
            if (aliasId === viewId) continue;
            if (workingViews[aliasId]) continue;
            viewsChanged = true;
            workingViews[aliasId] = nextViewEntry;
          }
          continue;
        }

        let formatChanged = false;
        const nextFormat: Record<string, any> = { ...format };
        const viewCollectionId =
          viewValue?.collection_id ??
          viewValue?.collectionId ??
          viewValue?.format?.collection_pointer?.id;
        const existingQueryEntry =
          typeof viewCollectionId === "string"
            ? recordMap.collection_query?.[viewCollectionId]?.[viewId]
            : null;

        if (Array.isArray(format.table_properties)) {
          const seen = new Set<string>();
          const deduped = format.table_properties.filter((prop: any) => {
            const key = prop?.property;
            if (typeof key !== "string" || key.length === 0) {
              return false;
            }
            if (seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          });

          if (deduped.length !== format.table_properties.length) {
            nextFormat.table_properties = deduped;
            formatChanged = true;
          }
        }

        // List rows always render title in their header.
        // Keep list_properties for metadata only, never duplicate title in body.
        if (
          viewValue?.type === "list" &&
          Array.isArray(format.list_properties)
        ) {
          let listChanged = false;
          const seenListProps = new Set<string>();
          const patchedList = format.list_properties
            .filter((p: any) => {
              const key = p?.property;
              if (typeof key !== "string" || key.length === 0) return false;
              if (seenListProps.has(key)) {
                listChanged = true;
                return false;
              }
              seenListProps.add(key);
              return true;
            })
            .map((p: any) => {
              if (!p || typeof p !== "object") {
                return p;
              }
              if (p.property === "title" && p.visible !== false) {
                listChanged = true;
                return { ...p, visible: false };
              }
              return p;
            });

          if (listChanged) {
            nextFormat.list_properties = patchedList;
            formatChanged = true;
          }
        }

        const groupedProperty =
          nextFormat.collection_group_by?.property ??
          nextFormat.board_columns_by?.property;
        const groupedTargetKey = nextFormat.collection_group_by
          ? "collection_groups"
          : nextFormat.board_columns_by
            ? "board_columns"
            : null;
        const existingGroups = groupedTargetKey
          ? nextFormat[groupedTargetKey]
          : null;
        const hasEmptyGroupedMetadata =
          !!groupedTargetKey &&
          typeof groupedProperty === "string" &&
          groupedProperty.length > 0 &&
          (!Array.isArray(existingGroups) || existingGroups.length === 0);

        if (hasEmptyGroupedMetadata) {
          const bucketKeys = getGroupedBucketKeys(existingQueryEntry);
          if (bucketKeys.length > 0) {
            nextFormat[groupedTargetKey!] = buildGroupsFromBucketKeys(
              bucketKeys,
              groupedProperty!,
            );
            formatChanged = true;
          }
        }

        if (!formatChanged) {
          const nextViewEntry = {
            ...(view as any),
            value: viewValue,
          } as any;
          if (viewChanged) {
            viewsChanged = true;
            workingViews[viewId] = nextViewEntry;
          }

          for (const aliasId of getIdAliases(viewValue?.id)) {
            if (aliasId === viewId) continue;
            if (workingViews[aliasId]) continue;
            viewsChanged = true;
            workingViews[aliasId] = nextViewEntry;
          }
          continue;
        }

        const nextViewEntry = {
          ...(view as any),
          value: {
            ...(viewValue as any),
            format: nextFormat,
          },
        } as any;
        viewsChanged = true;
        workingViews[viewId] = nextViewEntry;

        for (const aliasId of getIdAliases(viewValue?.id)) {
          if (aliasId === viewId) continue;
          if (workingViews[aliasId]) continue;
          workingViews[aliasId] = nextViewEntry;
        }
      }

      if (viewsChanged) {
        patchedViews = workingViews;
      }
    }

    if (!blocksChanged && !collectionsChanged && !viewsChanged) {
      return recordMap;
    }

    return {
      ...recordMap,
      ...(collectionsChanged ? { collection: patchedCollections! } : {}),
      ...(viewsChanged ? { collection_view: patchedViews! } : {}),
      ...(blocksChanged ? { block: patchedBlocks! } : {}),
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
