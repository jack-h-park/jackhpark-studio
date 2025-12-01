import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { useMemo } from "react";

import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { StatCard } from "@/components/ui/stat-card";
import type { RagDocumentStats } from "@/lib/admin/rag-documents";
import { numberFormatter } from "@/lib/admin/ingestion-formatters";

export function RagDocumentsOverview({
  stats,
}: {
  stats: RagDocumentStats | null;
}) {
  const docTypeEntries = useMemo(() => {
    if (!stats) {
      return [];
    }

    return Object.entries(stats.byDocType).toSorted(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [stats]);

  return (
    <section className="ai-card space-y-4 p-6">
      <CardHeader>
        <CardTitle icon={<FiLayers aria-hidden="true" />}>
          RAG Documents Overview
        </CardTitle>
        <p className="ai-card-description">
          Quick summary of stored documents and metadata.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats ? (
          <>
            <GridPanel className="grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
              <StatCard
                label="Total documents"
                value={numberFormatter.format(stats.total)}
              />
              <StatCard
                label="Public"
                value={numberFormatter.format(stats.publicCount)}
              />
              <StatCard
                label="Private"
                value={numberFormatter.format(stats.privateCount)}
              />
            </GridPanel>
            <div className="space-y-2">
              <div className="ai-meta-text uppercase tracking-[0.1em] text-xs">
                By doc type
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
                {docTypeEntries.map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between rounded-[var(--ai-radius-md)] border border-[color:var(--ai-border-soft)] bg-[hsl(var(--ai-surface))] px-3 py-2 text-sm"
                  >
                    <span className="text-[color:var(--ai-text-soft)]">
                      {type}
                    </span>
                    <span className="font-semibold">
                      {numberFormatter.format(count)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="ai-meta-text pl-1">
            Unable to load document stats right now.
          </div>
        )}
        <div className="flex justify-end">
          <LinkButton href="/admin/documents" variant="outline">
            View all documents
          </LinkButton>
        </div>
      </CardContent>
    </section>
  );
}
