import styles from "./NotionHeaderProperties.module.css";

type ExtraRow = {
  key: string;
  label: string;
  value: string;
};

type Props = {
  postedOnLabel: string;
  postedOnValue: string;
  extraRows: ExtraRow[];
};

const formatCountLabel = (count: number) =>
  count === 1 ? "1 more property" : `${count} more properties`;

const formatCountHideLabel = (count: number) =>
  count === 1 ? "Hide 1 property" : `Hide ${count} properties`;

export function NotionHeaderProperties({
  postedOnLabel,
  postedOnValue,
  extraRows,
}: Props) {
  const moreCount = extraRows.length;

  return (
    <div className={styles.root} data-custom-header-props="1">
      <div className={styles.row} data-role="primary" data-entry="posted_on">
        <span className={styles.labelCell}>
          <svg
            className={styles.iconSvg}
            aria-hidden="true"
            viewBox="0 0 24 24"
            role="presentation"
          >
            <path
              d="M7 2h1v2h8V2h1a1 1 0 011 1v5H6V3a1 1 0 011-1zm-1 8h14v11a1 1 0 01-1 1H7a1 1 0 01-1-1V10zm3 4h4v3H9v-3z"
              fill="currentColor"
            />
          </svg>
        <span className={styles.label} data-part="label">
          {postedOnLabel}
        </span>
        </span>
        <span
          className={styles.value}
          data-part="value"
          data-empty={postedOnValue ? undefined : "1"}
        >
          {postedOnValue}
        </span>
      </div>

      {moreCount > 0 && (
        <details className={styles.details}>
          <summary
            className={styles.toggleSummary}
            data-role="toggle"
            aria-label="Toggle Visible Properties"
          >
            <span className={styles.toggleIconCell} aria-hidden="true">
              <svg
                className={styles.iconSvg}
                aria-hidden="true"
                viewBox="0 0 24 24"
                role="presentation"
              >
                <path d="M3 7h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2z" />
              </svg>
            </span>
            <span className={styles.toggleLabels} data-role="toggle-label">
              <span
                className={styles.toggleLabelCollapsed}
                data-part="toggle-label-collapsed"
              >
                {formatCountLabel(moreCount)}
              </span>
              <span
                className={styles.toggleLabelOpen}
                data-part="toggle-label-open"
              >
                {formatCountHideLabel(moreCount)}
              </span>
            </span>
          </summary>
          <div className={styles.moreRows} data-role="more">
            {extraRows.map((extra) => (
              <div
                key={extra.key}
                className={styles.row}
                data-entry={extra.key}
                data-role="detail"
              >
              <span className={styles.labelCell}>
                <span className={styles.label} data-part="label">
                  {extra.label}
                </span>
              </span>
              <span
                className={styles.value}
                data-part="value"
                data-empty={extra.value === "Empty" ? "1" : undefined}
              >
                {extra.value}
              </span>
            </div>
          ))}
          </div>
        </details>
      )}
    </div>
  );
}
