"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { NotionHeaderProperties } from "./NotionHeaderProperties";

type ExtraRow = {
  key: string;
  label: string;
  value: string;
};

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const formatLongDate = (value?: string) => {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return LONG_DATE_FORMATTER.format(parsed);
};

const trimText = (el: Element | null) => el?.textContent?.trim() ?? "";

const collectValues = (anchor: Element) => {
  const rows = Array.from(
    anchor.querySelectorAll<HTMLElement>(".notion-collection-row-property"),
  );

  const parsed = rows
    .map((row, index) => {
      const labelElement = row.querySelector(
        ".notion-collection-column-title-body",
      );
      const label = labelElement?.textContent?.trim() ?? "";
      const valueElement = row.querySelector(".notion-property");
      const value = valueElement?.textContent?.trim() ?? "";
      return {
        key: `${label || "prop"}-${index}`,
        label,
        value,
      };
    })
    .filter((entry) => entry.label);

  if (parsed.length === 0) {
    return {
      postedOnLabel: "Posted on",
      postedOnValue: "",
      extraRows: [] as ExtraRow[],
    };
  }

  const primary =
    parsed.find((entry) =>
      /posted on|published|date/i.test(entry.label),
    ) ?? parsed[0];

  const extraRows = parsed
    .filter((entry) => entry.key !== primary.key)
    .map((entry) => {
      if (!entry.value) {
        if (entry.label.toLowerCase().includes("tags")) {
          return {
            ...entry,
            value: "Empty",
          };
        }
        return { ...entry, value: "" };
      }
      return entry;
    })
    .filter((entry) => entry.value.length > 0 || entry.label.toLowerCase().includes("tags"));

  return {
    postedOnLabel: primary.label || "Posted on",
    postedOnValue: formatLongDate(primary.value) || primary.value,
    extraRows,
  };
};

export function NotionHeaderPropertiesPortal({ enabled }: { enabled: boolean }) {
  const [mountNode, setMountNode] = React.useState<HTMLElement | null>(null);
  const [values, setValues] = React.useState<{
    postedOnLabel: string;
    postedOnValue: string;
    extraRows: ExtraRow[];
  }>({
    postedOnLabel: "Posted on",
    postedOnValue: "",
    extraRows: [],
  });

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

      mount =
        document.getElementById(
          "notion-custom-header-props-mount",
        ) as HTMLElement | null;

      if (!mount) {
        mount = document.createElement("div");
        mount.id = "notion-custom-header-props-mount";
        mount.setAttribute("data-custom-header-props-mount", "1");
        createdMount = true;
      }

      if (mount.parentElement !== anchor.parentElement) {
        anchor.parentElement?.insertBefore(mount, anchor);
      }

      if (!mount) return;
      setMountNode(mount);
      setValues(collectValues(anchor));
    };

    raf = requestAnimationFrame(attach);

    return () => {
      cancelled = true;
      if (raf !== null) {
        cancelAnimationFrame(raf);
      }
      if (createdMount && mount && mount.parentElement) {
        mount.parentElement.removeChild(mount);
      }
    };
  }, [enabled]);

  if (!enabled || !mountNode) {
    return null;
  }

  return createPortal(
      <NotionHeaderProperties
        postedOnLabel={values.postedOnLabel}
        postedOnValue={values.postedOnValue}
        extraRows={values.extraRows}
      />,
    mountNode,
  );
}
