"use client";

import { type ExtendedRecordMap } from "notion-types";
import * as React from "react";
import { createPortal } from "react-dom";

import { NotionHeaderProperties } from "./NotionHeaderProperties";

type Props = {
  enabled: boolean;
  recordMap?: ExtendedRecordMap;
  pageId?: string | null;
};

export function NotionHeaderPropertiesPortal({
  enabled,
  recordMap,
  pageId,
}: Props) {
  const [mountNode, setMountNode] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let raf: number | null = null;
    let createdMount = false;
    let mount: HTMLElement | null = null;

    const attach = () => {
      if (cancelled) return;

      const anchor =
        document.querySelector(
          ".notion-page .notion-collection-page-properties",
        ) ?? document.querySelector(".notion-collection-page-properties");

      if (!anchor) {
        raf = requestAnimationFrame(attach);
        return;
      }

      mount = document.getElementById(
        "notion-custom-header-props-mount",
      ) as HTMLElement | null;

      if (!mount) {
        mount = document.createElement("div");
        mount.id = "notion-custom-header-props-mount";
        mount.dataset.customHeaderPropsMount = "1";
        createdMount = true;
      }

      if (mount.parentElement !== anchor.parentElement) {
        anchor.parentElement?.insertBefore(mount, anchor);
      }

      if (!mount) return;
      setMountNode(mount);
    };

    raf = requestAnimationFrame(attach);

    return () => {
      cancelled = true;
      if (raf !== null) {
        cancelAnimationFrame(raf);
      }
      if (createdMount && mount && mount.parentElement) {
        mount.remove();
      }
    };
  }, [enabled]);

  if (!enabled || !mountNode) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[NotionHeaderPropertiesPortal] Not rendering.", {
        enabled,
        mountNode: !!mountNode,
      });
    }
    return null;
  }

  return createPortal(
    <NotionHeaderProperties recordMap={recordMap} pageId={pageId} />,
    mountNode,
  );
}
