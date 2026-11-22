"use client";

import type { ExtendedRecordMap } from "notion-types";
import type * as React from "react";
import type { MapImageUrlFn, NotionComponents } from "react-notion-x";
import dynamic from "next/dynamic";

export interface NotionPageRendererProps {
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

const ClientBody = dynamic(
  () =>
    import("./NotionPageRendererClient").then(
      (module) => module.NotionPageRendererClient,
    ),
  { ssr: false },
);

// The renderer already mounts its body only in the browser. Preserve its
// server frame without loading code/math vendors or sanitizing the body map.
export function NotionPageRenderer(props: NotionPageRendererProps) {
  const hasCustomHeader = Boolean(
    props.recordMap && props.pageId && props.showCustomHeader,
  );
  return (
    <div
      className={
        hasCustomHeader
          ? "notion-wrapper has-custom-header-props"
          : "notion-wrapper"
      }
    >
      <div className="notion-frame">
        <ClientBody {...props} />
      </div>
    </div>
  );
}
