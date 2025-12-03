import type { JSX } from "react";
import { FiClock } from "@react-icons/all-files/fi/FiClock";
import { FiDatabase } from "@react-icons/all-files/fi/FiDatabase";

import type { DatasetSnapshotOverview } from "@/lib/admin/ingestion-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { StatCard } from "@/components/ui/stat-card";
import {
  buildSparklineData,
  formatCharacters,
  formatDeltaLabel,
  formatPercentChange,
  numberFormatter,
  SNAPSHOT_HISTORY_LIMIT,
} from "@/lib/admin/ingestion-formatters";
import { formatEmbeddingSpaceLabel } from "@/lib/admin/recent-runs-filters";

import { ClientSideDate } from "./ClientSideDate";

export function DatasetSnapshotSection({
  overview,
}: {
  overview: DatasetSnapshotOverview;
}): JSX.Element {
  const { latest, history } = overview;
  const embeddingLabel = latest
    ? formatEmbeddingSpaceLabel(latest.embeddingSpaceId)
    : "Unknown model";
  const previous = history.length > 1 ? history[1] : null;
  const percentChange =
    latest && previous
      ? formatPercentChange(latest.totalDocuments, previous.totalDocuments)
      : null;
  const sparklineData = buildSparklineData(
    history.toReversed().map((entry) => entry.totalDocuments),
  );

  const historyList = history.slice(0, SNAPSHOT_HISTORY_LIMIT);

  if (!latest) {
    return (
      <section className="ai-card space-y-4 p-6">
        <CardHeader>
          <CardTitle icon={<FiDatabase aria-hidden="true" />}>
            Dataset Snapshot
          </CardTitle>
          <p className="ai-card-description">
            Snapshot history will appear after the next successful ingestion
            run.
          </p>
        </CardHeader>
        <CardContent>
          <div className="ai-meta-text pl-4 text-center">
            <p>
              No snapshot records found. Run an ingestion job to capture the
              initial dataset state.
            </p>
          </div>
        </CardContent>
      </section>
    );
  }

  const metrics = [
    {
      key: "documents",
      label: "Documents",
      value: numberFormatter.format(latest.totalDocuments),
      delta: latest.deltaDocuments,
    },
    {
      key: "chunks",
      label: "Chunks",
      value: numberFormatter.format(latest.totalChunks),
      delta: latest.deltaChunks,
    },
    {
      key: "characters",
      label: "Characters",
      value: formatCharacters(latest.totalCharacters),
      delta: latest.deltaCharacters,
    },
  ];

  return (
    <section className="ai-card space-y-4 p-6">
      <CardHeader>
        <CardTitle icon={<FiDatabase aria-hidden="true" />}>
          Dataset Snapshot
        </CardTitle>
        <p className="ai-card-description">
          Latest captured totals from the `rag_snapshot` rollup.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <GridPanel className="grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {metrics.map((metric) => {
            const deltaLabel = formatDeltaLabel(metric.delta);
            const tone =
              metric.delta === null
                ? undefined
                : metric.delta > 0
                  ? "success"
                  : "error";
            return (
              <StatCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                delta={
                  deltaLabel
                    ? { text: deltaLabel, tone: tone ?? "muted" }
                    : undefined
                }
              />
            );
          })}
          <Card className="md:col-span-2">
            <CardContent className="space-y-3">
              <p className="ai-label-overline tracking-widest text-[color:var(--ai-text-muted)]">
                Trend
              </p>
              {sparklineData ? (
                <>
                  <svg
                    className="w-full h-[80px]"
                    viewBox="0 0 100 100"
                    role="img"
                    aria-label="Snapshot trend sparkline"
                  >
                    <path
                      className="fill-none stroke-[color-mix(in_srgb,var(--ai-accent)_90%,transparent)] stroke-2"
                      d={sparklineData.path}
                    />
                  </svg>
                  <div className="mt-1.5 flex justify-between text-xs text-[color:var(--ai-text-muted)]">
                    <span className="ai-meta-text">
                      Min: {numberFormatter.format(sparklineData.min)} · Max:{" "}
                      {numberFormatter.format(sparklineData.max)}
                    </span>
                    {percentChange ? (
                      <span className="ai-meta-text">
                        {percentChange} vs prev.
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <span className="ai-meta-text">
                  More history needed for trend
                </span>
              )}
            </CardContent>
          </Card>
        </GridPanel>
        <dl className="mt-6">
          <GridPanel className="grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 ai-label-overline tracking-wide text-[color:var(--ai-text-muted)]">
                Embedding Model
              </dt>
              <dd className="mt-0.5 text-sm text-[color:var(--ai-text-soft)]">
                {embeddingLabel}
              </dd>
            </div>
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 ai-label-overline tracking-wide text-[color:var(--ai-text-muted)]">
                Ingestion Mode
              </dt>
              <dd className="mt-0.5 text-sm text-[color:var(--ai-text-soft)]">
                {latest.ingestionMode ?? "—"}
              </dd>
            </div>
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 ai-label-overline tracking-wide text-[color:var(--ai-text-muted)]">
                Captured
              </dt>
              <dd className="mt-0.5 text-sm text-[color:var(--ai-text-soft)]">
                {latest.capturedAt ? (
                  <ClientSideDate value={latest.capturedAt} />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 ai-label-overline tracking-wide text-[color:var(--ai-text-muted)]">
                Source Run
              </dt>
              <dd className="mt-0.5 text-sm text-[color:var(--ai-text-soft)]">
                {latest.runId ? (
                  <code className="font-mono text-xs bg-[color:var(--ai-border-soft)] px-1.5 py-0.5 rounded-md">
                    {latest.runId}
                  </code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 ai-label-overline tracking-wide text-[color:var(--ai-text-muted)]">
                Schema Version
              </dt>
              <dd className="mt-0.5 text-sm text-[color:var(--ai-text-soft)]">
                {latest.schemaVersion ?? "—"}
              </dd>
            </div>
          </GridPanel>
        </dl>
        <section className="ai-panel mt-6 space-y-3 shadow-none border-[color:var(--ai-border-muted)] rounded-[14px] bg-[color:var(--ai-surface)] px-5 py-4">
          <header className="flex flex-col gap-1 mb-3">
            <HeadingWithIcon
              as="h3"
              icon={<FiClock aria-hidden="true" />}
              className="ai-label-emphasis text-base"
            >
              Recent Snapshots{" "}
              <span className="ml-1.5 text-sm text-[color:var(--ai-text-muted)]">
                ({historyList.length})
              </span>
            </HeadingWithIcon>
            <p className="m-0 text-sm text-[color:var(--ai-text-muted)]">
              Comparing the most recent {historyList.length} captures.
            </p>
          </header>
          <ul className="list-none p-0 m-0 grid gap-3">
            {historyList.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-[color:var(--ai-border-soft)] last:border-b-0"
              >
                <div className="flex flex-col gap-1">
                  <div>
                    <span className="block text-sm text-[color:var(--ai-text-soft)]">
                      {entry.capturedAt ? (
                        <ClientSideDate value={entry.capturedAt} />
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="block text-xs text-[color:var(--ai-text-muted)]">
                      {formatEmbeddingSpaceLabel(entry.embeddingSpaceId)}
                    </span>
                  </div>
                  <div className="flex gap-2.5 text-xs text-[color:var(--ai-text-muted)]">
                    <span>
                      Docs: {numberFormatter.format(entry.totalDocuments)} (
                      {formatDeltaLabel(entry.deltaDocuments) ?? "0"})
                    </span>
                    <span>
                      Chunks: {numberFormatter.format(entry.totalChunks)} (
                      {formatDeltaLabel(entry.deltaChunks) ?? "0"})
                    </span>
                  </div>
                </div>
                {index === 0 ? (
                  <span className="text-xs uppercase tracking-wider px-2 py-1 rounded-full bg-[color:var(--ai-accent-bg)] text-[color:var(--ai-accent-strong)] font-semibold">
                    Latest
                  </span>
                ) : (
                  <span className="text-xs uppercase tracking-wider px-2 py-1 rounded-full bg-[color:var(--ai-border-soft)] text-[color:var(--ai-text-muted)] font-semibold">
                    #{index + 1}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </section>
  );
}
