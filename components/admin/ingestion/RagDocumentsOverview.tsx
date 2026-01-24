import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { useMemo } from "react";

import type { RagDocumentStats } from "@/lib/admin/rag-documents";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/components/ui/utils";
import { numberFormatter } from "@/lib/admin/ingestion-formatters";

import styles from "./RagDocumentsOverview.module.css";

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
    ? [
        {
          label: "Total documents",
          value: numberFormatter.format(stats.total),
        },
        {
          label: "Visibility",
          value: (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "font-semibold",
                  stats.publicCount === 0
                    ? "text-[color:var(--ai-text-soft)]"
                    : "text-[color:var(--ai-text-strong)]",
                )}
              >
                Public {numberFormatter.format(stats.publicCount)}
              </span>
              <span
                className={cn(
                  "font-semibold",
                  stats.privateCount === 0
                    ? "text-[color:var(--ai-text-soft)]"
                    : "text-[color:var(--ai-text-strong)]",
                )}
              >
                Private {numberFormatter.format(stats.privateCount)}
              </span>
            </div>
          ),
          valueClassName: "text-sm font-semibold text-[color:var(--ai-text-strong)]",
        },
      ]
    : [];

  return (
    <section className="ai-card space-y-4 p-5">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <CardTitle icon={<FiLayers aria-hidden="true" />}>
            RAG Documents Overview
          </CardTitle>
          <LinkButton href="/admin/documents" variant="outline">
            View all documents
          </LinkButton>
        </div>
        <p className="ai-card-description">
          Quick summary of stored documents and metadata.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-3">
        {stats ? (
          <>
            <GridPanel className="grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              {statTiles.map((tile) => (
                <div
                  key={tile.label}
                  className="ai-panel shadow-none rounded-[12px] px-4 py-3"
                >
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-[color:var(--ai-text-muted)]">
                    {tile.label}
                  </p>
                  <div
                    className={cn(
                      "mt-1 text-[color:var(--ai-text-strong)]",
                      tile.valueClassName ?? "text-2xl font-semibold",
                    )}
                  >
                    {tile.value}
                  </div>
                </div>
              ))}
            </GridPanel>
            <div className="space-y-1">
              <div className="ai-meta-text uppercase tracking-[0.1em] text-xs">
                By doc type
              </div>
              <div className={styles.docTypeGrid}>
                {docTypeEntries.map(([type, count]) => (
                  <span
                    key={type}
                    className={cn(
                      styles.docTypeChip,
                      count === 0 && styles.docTypeChipZero,
                      type === "unknown" && styles.docTypeChipUnknown,
                    )}
                    title={type === "unknown" ? "Unknown doc type" : undefined}
                  >
                    <span>{type}</span>
                    <span>{count > 0 ? numberFormatter.format(count) : "—"}</span>
                  </span>
                ))}
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
