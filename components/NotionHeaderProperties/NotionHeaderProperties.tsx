import { type ExtendedRecordMap } from "notion-types";
import * as React from "react";

import { usePageVisibleProperties } from "../PageVisibleProperties/PageVisibleProperties";
import styles from "./NotionHeaderProperties.module.css";

type Props = {
  recordMap?: ExtendedRecordMap;
  pageId?: string | null;
};

const formatCountLabel = (count: number) =>
  count === 1 ? "1 more property" : `${count} more properties`;

const formatCountHideLabel = (count: number) =>
  count === 1 ? "Hide 1 property" : `Hide ${count} properties`;

const getIconForType = (type?: string, name?: string) => {
  // Map schema types to Notion icons
  const t = type?.toLowerCase();
  const n = name?.toLowerCase();

  if (t === "date" || n === "posted on" || n === "published") {
    // Calendar Icon (Outline style)
    return (
      <path
        d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"
        fill="currentColor"
        fillOpacity="0.8"
      />
    );
  }

  if (t === "created_time" || n === "created" || t === "last_edited_time") {
    // Clock Icon (Outline style)
    return (
      <path
        d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
        fill="currentColor"
        fillOpacity="0.8"
      />
    );
  }

  if (t === "multi_select" || n === "tags") {
    // Multi-select / Tags Icon (List with bullets)
    return (
      <path
        d="M4 7h2v2H4V7zm0 4h2v2H4v-2zm0 4h2v2H4v-2zm4-8h12v2H8V7zm0 4h12v2H8v-2zm0 4h12v2H8v-2z"
        fill="currentColor"
        fillOpacity="0.8"
      />
    );
  }

  if (t === "select") {
    // Select Icon (Circle Chevron Outline)
    return (
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9l5 5 5-5-1.41-1.41L12 11.17 8.41 9.59 7 11z"
        fill="currentColor"
        fillOpacity="0.8"
      />
    );
  }

  if (t === "person" || t === "created_by" || t === "last_edited_by") {
    return (
      <path
        d="M12 2a5 5 0 105 5 5 5 0 00-5-5zm0 8a3 3 0 113-3 3 3 0 01-3 3zm9 11v-1a7 7 0 00-7-7h-4a7 7 0 00-7 7v1h2v-1a5 5 0 015-5h4a5 5 0 015 5v1z"
        fill="currentColor"
      />
    );
  }

  if (t === "url") {
    return (
      <path
        d="M14.83 11.17a3.003 3.003 0 00-4.24 0L7.41 14.34a3 3 0 004.24 4.24l.71-.71-1.42-1.41-.7.71a1 1 0 01-1.42 0 1 1 0 010-1.42l3.17-3.17a1 1 0 011.42 0 1 1 0 010 1.42l-.71.7 1.41 1.42.71-.71a3 3 0 000-4.24zm-2-2.83a3.003 3.003 0 00-4.24 0L5.41 11.51a3 3 0 004.24 4.24l.71-.71-1.42-1.41-.7.71a1 1 0 01-1.42 0 1 1 0 010-1.42l3.17-3.17a1 1 0 011.42 0 1 1 0 010 1.42l-.71.7 1.41 1.42.71-.71a3 3 0 000-4.24z"
        fill="currentColor"
      />
    );
  }

  if (t === "checkbox") {
    return (
      <path
        d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 16H5V5h14v14zm-9-4l-5-5 1.41-1.41L10 12.17l7.59-7.59L19 6l-9 9z"
        fill="currentColor"
      />
    );
  }

  // Default generic document
  return (
    <path
      d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
      fill="currentColor"
    />
  );
};

export function NotionHeaderProperties({ recordMap, pageId }: Props) {
  const { entries } = usePageVisibleProperties({
    recordMap,
    pageId,
  });

  if (entries.length === 0) return null;

  // "Primary" property is the first one
  const primary = entries[0];
  const extraRows = entries.slice(1);
  const moreCount = extraRows.length;

  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className={styles.root} data-custom-header-props="1">
      {/* Primary Row (always visible) */}
      <div
        className={styles.row}
        data-role="primary"
        data-entry={primary.propertyId}
      >
        <span className={styles.labelCell}>
          <svg
            className={styles.iconSvg}
            aria-hidden="true"
            viewBox="0 0 24 24"
            role="presentation"
          >
            {getIconForType(primary.schemaType, primary.label)}
          </svg>
          <span className={styles.label} data-part="label">
            {primary.label}
          </span>
        </span>
        <span
          className={styles.value}
          data-part="value"
          data-empty={!primary.value ? "1" : undefined}
        >
          {primary.value}
        </span>
      </div>

      {moreCount > 0 && (
        <>
          {/* Expanded Rows */}
          {isExpanded && (
            <div className={styles.moreRows} data-role="more">
              {extraRows.map((extra) => (
                <div
                  key={extra.propertyId}
                  className={styles.row}
                  data-entry={extra.propertyId}
                  data-role="detail"
                >
                  <span className={styles.labelCell}>
                    <svg
                      className={styles.iconSvg}
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      role="presentation"
                    >
                      {getIconForType(extra.schemaType, extra.label)}
                    </svg>
                    <span className={styles.label} data-part="label">
                      {extra.label}
                    </span>
                  </span>
                  <span
                    className={styles.value}
                    data-part="value"
                    data-empty={!extra.value ? "1" : undefined}
                  >
                    {extra.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Toggle Button (Bottom) */}
          <div
            className={styles.toggleRow}
            onClick={() => setIsExpanded(!isExpanded)}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            data-role="toggle"
          >
            <span className={styles.toggleIconCell} aria-hidden="true">
              <svg
                className={styles.iconSvg}
                aria-hidden="true"
                viewBox="0 0 24 24"
                role="presentation"
                style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}
              >
                <path
                  d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className={styles.toggleLabels} data-role="toggle-label">
              <span className={styles.toggleLabelText}>
                {isExpanded
                  ? formatCountHideLabel(moreCount)
                  : formatCountLabel(moreCount)}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
