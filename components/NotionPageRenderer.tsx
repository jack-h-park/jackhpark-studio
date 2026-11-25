"use client";

import type { ExtendedRecordMap } from "notion-types";
import type * as React from "react";
import type { MapImageUrlFn, NotionComponents } from "react-notion-x";

import { NotionPageBody } from "./NotionPageBody";

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

// The body renders on the server so no-JavaScript readers get the prose; only
// the vendor block renderers (code, math, collections, modal, PDF) wait for
// the browser. See NotionPageBody.
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
        <NotionPageBody {...props} />
      </div>
    </div>
  );
}
