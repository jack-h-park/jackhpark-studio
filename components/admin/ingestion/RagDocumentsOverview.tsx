import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { type ReactNode, useMemo } from "react";

import type { RagDocumentStats } from "@/lib/admin/rag-documents";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/components/ui/utils";
import { numberFormatter } from "@/lib/admin/ingestion-formatters";

import styles from "./RagDocumentsOverview.module.css";

type PersonaMetricType = "personal" | "professional" | "hybrid" | "unknown";
type SourceMetricType = "notion" | "url" | "unknown";

const personaMetricSpecs = [
  { type: "personal", label: "Personal" },
  { type: "professional", label: "Professional" },
  { type: "hybrid", label: "Hybrid" },
] satisfies ReadonlyArray<{ type: Exclude<PersonaMetricType, "unknown">; label: string }>;

const sourceMetricSpecs = [
  { type: "notion", label: "Notion" },
  { type: "url", label: "URL" },
] satisfies ReadonlyArray<{ type: Exclude<SourceMetricType, "unknown">; label: string }>;

type RagDocumentsStatTileProps = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
};

function RagDocumentsStatTile({
  label,
  value,
  valueClassName,
}: RagDocumentsStatTileProps) {
  const valueClasses = valueClassName ?? styles.kpiMetricValue;

  return (
    <div className={cn("ai-panel shadow-none rounded-[12px]", styles.kpiTile)}>
      <div className={styles.kpiLabelRow}>
        <p className={styles.kpiTileTitle}>{label}</p>
      </div>
      <div className={styles.kpiValueRow}>
        <div className={valueClasses}>{value}</div>
      </div>
    </div>
  );
}

export function RagDocumentsOverview({
  stats,
}: {
  stats: RagDocumentStats | null;
}) {
  const docTypeEntries = useMemo(() => {
    if (!stats) {
      return [];
    }

    const entries = Object.entries(stats.byDocType);
    const unknownEntry = entries.find(([type]) => type === "unknown");
    const filtered = entries.filter(([type]) => type !== "unknown");
    const nonZero = filtered
      .filter(([, count]) => count > 0)
      .toSorted(([, aCount], [, bCount]) => bCount - aCount);
    const zero = filtered
      .filter(([, count]) => count === 0)
      .toSorted(([a], [b]) => a.localeCompare(b));

    return [...nonZero, ...zero, ...(unknownEntry ? [unknownEntry] : [])];
  }, [stats]);

  const statTiles = stats
    ? (() => {
        const personaEntries: Array<{ type: PersonaMetricType; label: string }> = [
          ...personaMetricSpecs.filter(
            ({ type }) => stats.personaCounts[type] > 0,
          ),
          ...(stats.personaCounts.unknown > 0
            ? [{ type: "unknown" as const, label: "Unassigned" }]
            : []),
        ];

        const sourceEntries: Array<{ type: SourceMetricType; label: string }> = [
          ...sourceMetricSpecs,
          ...(stats.sourceCounts.unknown > 0
            ? [{ type: "unknown" as const, label: "Unknown" }]
            : []),
        ];

        return [
          {
            label: "Total documents",
            value: numberFormatter.format(stats.total),
          },
          {
            label: "Visibility",
            value: (
              <>
                <div
                  className={styles.miniMetric}
                  title={`Public: ${stats.publicCount} documents`}
                >
                  <span className={styles.kpiMetricLabel}>Public</span>
                  <span
                    className={cn(
                      styles.kpiMetricValue,
                      stats.publicCount === 0 && styles.kpiMetricValueZero,
                    )}
                  >
                    {stats.publicCount === 0
                      ? "—"
                      : numberFormatter.format(stats.publicCount)}
                  </span>
                </div>
                <div
                  className={styles.miniMetric}
                  title={`Private: ${stats.privateCount} documents`}
                >
                  <span className={styles.kpiMetricLabel}>Private</span>
                  <span
                    className={cn(
                      styles.kpiMetricValue,
                      stats.privateCount === 0 && styles.kpiMetricValueZero,
                    )}
                  >
                    {stats.privateCount === 0
                      ? "—"
                      : numberFormatter.format(stats.privateCount)}
                  </span>
                </div>
                {stats.publicCount === 0 && stats.privateCount === 0 && (
                  <span className={styles.kpiHelperText}>
                    No public/private docs
                  </span>
                )}
              </>
            ),
            valueClassName: styles.miniMetricGrid,
          },
          {
            label: "Persona",
            value: (
              <>
                {personaEntries.map(({ type, label }) => {
                  const count = stats.personaCounts[type];
                  const isUnknown = type === "unknown";
                  const title = isUnknown
                    ? "Persona not set on these documents."
                    : undefined;
                  return (
                    <div
                      key={type}
                      className={styles.miniMetric}
                      title={title}
                    >
                      <span className={styles.kpiMetricLabel}>{label}</span>
                      <span
                        className={cn(
                          styles.kpiMetricValue,
                          isUnknown && styles.kpiMetricValueSecondary,
                        )}
                      >
                        {numberFormatter.format(count)}
                      </span>
                    </div>
                  );
                })}
              </>
            ),
            valueClassName: styles.miniMetricGrid,
          },
          {
            label: "Source",
            value: (
              <>
                {sourceEntries.map(({ type, label }) => {
                  const count = stats.sourceCounts[type];
                  const isUnknown = type === "unknown";
                  const title = isUnknown
                    ? "Missing source metadata"
                    : `${label}: ${count} documents`;
                  return (
                    <div
                      key={type}
                      className={styles.miniMetric}
                      title={title}
                    >
                      <span className={styles.kpiMetricLabel}>{label}</span>
                      <span
                        className={cn(
                          styles.kpiMetricValue,
                          count === 0 && styles.kpiMetricValueZero,
                          isUnknown && styles.kpiMetricValueSecondary,
                        )}
                      >
                        {count === 0 ? "—" : numberFormatter.format(count)}
                      </span>
                    </div>
                  );
                })}
              </>
            ),
            valueClassName: styles.miniMetricGrid,
          },
        ];
      })()
    : [];

  return (
    <section className="ai-card space-y-4 p-5">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <CardTitle icon={<FiLayers aria-hidden="true" />}>
            RAG Documents Overview
          </CardTitle>
          <LinkButton
            href="/admin/documents"
            variant="outline"
            className="h-8 px-3 text-sm"
          >
            View all documents
          </LinkButton>
        </div>
        <p className="ai-card-description">
          Quick summary of stored documents and metadata.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        {stats ? (
          <>
            <GridPanel className={styles.kpiGrid}>
              {statTiles.map((tile) => (
                <RagDocumentsStatTile
                  key={tile.label}
                  label={tile.label}
                  value={tile.value}
                  valueClassName={tile.valueClassName}
                />
              ))}
            </GridPanel>
            <div className={styles.docTypeRow}>
              <div className={styles.docTypeLabel}>By doc type</div>
              <div className={styles.docTypeGrid}>
                {docTypeEntries.map(([type, count]) => {
                  const isUnknown = type === "unknown";
                  const isZero = count === 0 && !isUnknown;
                  const displayCount = numberFormatter.format(count);
                  const title = isZero
                    ? `${type}: 0 documents`
                    : isUnknown
                      ? "Missing/unknown doc_type"
                      : undefined;

                  return (
                    <span
                      key={type}
                      className={cn(
                        styles.docTypeChip,
                        isZero && styles.docTypeChipZero,
                        isUnknown && styles.docTypeChipUnknown,
                      )}
                      title={title}
                    >
                      <span className={styles.docTypeChipLabel}>{type}</span>
                      {!isZero && (
                        <span
                          className={cn(
                            styles.docTypeCount,
                            isZero && styles.docTypeCountMuted,
                            isZero && styles.docTypeChipZeroText,
                          )}
                        >
                          {displayCount}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="ai-meta-text pl-1">
            Unable to load document stats right now.
          </div>
        )}
      </CardContent>
    </section>
  );
}
