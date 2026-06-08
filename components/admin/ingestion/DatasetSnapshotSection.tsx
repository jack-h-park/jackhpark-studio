"use client";

import { FiClock } from "@react-icons/all-files/fi/FiClock";
import { FiCopy } from "@react-icons/all-files/fi/FiCopy";
import { FiDatabase } from "@react-icons/all-files/fi/FiDatabase";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { type JSX, type ReactNode,useState } from "react";

import type { DatasetSnapshotOverview } from "@/lib/admin/ingestion-types";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientSideDate } from "@/components/ui/client-side-date";
import {
  DashboardStatTile,
  type DashboardStatTone,
} from "@/components/ui/dashboard-stat-tile";
import { GridPanel } from "@/components/ui/grid-panel";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/components/ui/utils";
import {
  buildSparklineData,
  formatBytesFromCharacters,
  formatCharacterCountLabel,
  formatDeltaLabel,
  formatIngestionModeLabel,
  formatKpiValue,
  formatPercentChange,
  numberFormatter,
  SNAPSHOT_HISTORY_LIMIT,
} from "@/lib/admin/ingestion-formatters";
import { formatEmbeddingSpaceLabel } from "@/lib/admin/recent-runs-filters";

import styles from "./DatasetSnapshotSection.module.css";

const shortenId = (value?: string | null, prefix = 6, suffix = 4) => {
  if (!value) {
    return "—";
  }
  if (value.length <= prefix + suffix) {
    return value;
  }
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
};

const formatEmbeddingDisplayLabel = (label?: string | null) => {
  if (!label) {
    return "Unknown model";
  }
  const versionMatch = label.match(/\(.*\)$/);
  const version = versionMatch?.[0] ?? "";
  const base = version
    ? label.slice(0, label.length - version.length).trim()
    : label;
  const [provider, ...rest] = base.split(" ");
  if (!provider || rest.length === 0) {
    return label;
  }
  const model = rest.join(" ").replace(/^text-embedding-/, "");
  const trimmed = `${provider} ${model}`.split(/\s+/).join(" ").trim() || label;
  return version ? `${trimmed} ${version}` : trimmed;
};

const formatDeltaOrDash = (value: number | null | undefined) => {
  const formatted = formatDeltaLabel(value ?? null);
  return formatted ?? "—";
};

const formatSignedBytesDelta = (value: number | null | undefined) => {
  if (!value) {
    return "—";
  }
  const formatted = formatBytesFromCharacters(Math.abs(value));
  return `${value > 0 ? "+" : "-"}${formatted}`;
};

export type SnapshotEntry = DatasetSnapshotOverview["history"][number];

const formatSnapshotRowSummary = (entry: SnapshotEntry) => {
  const docs = numberFormatter.format(entry.totalDocuments);
  const chunks = numberFormatter.format(entry.totalChunks);
  const size = formatBytesFromCharacters(entry.totalCharacters);
  return `Docs ${docs} · Chunks ${chunks} · Size ${size}`;
};

const formatDeltaTitleValue = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "0";
  }
  return value >= 0 ? `+${value}` : `${value}`;
};

const formatBytesDeltaTitleValue = (value: number | null | undefined) => {
  if (!value) {
    return "0KB";
  }
  return `${value > 0 ? "+" : "-"}${formatBytesFromCharacters(Math.abs(value))}`;
};

const formatSnapshotRowTitle = (entry: SnapshotEntry) => {
  const docs = numberFormatter.format(entry.totalDocuments);
  const chunks = numberFormatter.format(entry.totalChunks);
  const size = formatBytesFromCharacters(entry.totalCharacters);
  const docDelta = formatDeltaTitleValue(entry.deltaDocuments);
  const chunkDelta = formatDeltaTitleValue(entry.deltaChunks);
  const sizeDelta = formatBytesDeltaTitleValue(entry.deltaCharacters ?? 0);
  return `Docs ${docs} (Δ ${docDelta}) · Chunks ${chunks} (Δ ${chunkDelta}) · Size ${size} (Δ ${sizeDelta})`;
};

const combineDeltaAndPct = (
  delta: string | null,
  pct: string | null,
): string | null => {
  if (!delta) return null;
  if (pct) return `${delta} (${pct})`;
  return delta;
};

type DatasetMetricDelta = {
  text: string;
  tone?: DashboardStatTone;
};

type DatasetSnapshotSectionProps = {
  overview: DatasetSnapshotOverview;
  selectedSnapshotId?: string | null;
  onSelectSnapshot?: (snapshot: SnapshotEntry) => void;
};

function DatasetMetricTile({
  label,
  value,
  delta,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: DatasetMetricDelta;
}): JSX.Element {
  return (
    <DashboardStatTile
      label={label}
      value={value}
      delta={delta}
      className={styles.kpiTile}
      deltaClassName={cn(styles.kpiHelperText, styles.kpiDeltaText)}
      sectionHint="Dataset Snapshot"
    />
  );
}

function CopyButton({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      title={copied ? "Copied!" : "Copy run ID"}
      className={styles.copyButton}
    >
      <FiCopy className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

export function DatasetSnapshotSection({
  overview,
  selectedSnapshotId,
  onSelectSnapshot,
}: DatasetSnapshotSectionProps): JSX.Element {
  const { latest, history } = overview;
  const embeddingLabel = latest
    ? formatEmbeddingSpaceLabel(latest.embeddingSpaceId)
    : "Unknown model";
  const previous = history.length > 1 ? history[1] : null;
  const percentChange =
    latest && previous
      ? formatPercentChange(latest.totalDocuments, previous.totalDocuments)
      : null;
  const isPositiveChange = percentChange?.startsWith("+") ?? false;
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

  const documentValue = formatKpiValue(latest.totalDocuments);
  const chunkValue = formatKpiValue(latest.totalChunks);
  const characterPrimaryValue = formatBytesFromCharacters(
    latest.totalCharacters,
  );
  const characterDetailLabel = formatCharacterCountLabel(
    latest.totalCharacters,
  );
  const displayEmbeddingLabel = formatEmbeddingDisplayLabel(embeddingLabel);

  const rawCharDelta = formatSignedBytesDelta(latest.deltaCharacters);
  const docDeltaText = combineDeltaAndPct(
    formatDeltaLabel(latest.deltaDocuments),
    previous
      ? formatPercentChange(latest.totalDocuments, previous.totalDocuments)
      : null,
  );
  const chunkDeltaText = combineDeltaAndPct(
    formatDeltaLabel(latest.deltaChunks),
    previous
      ? formatPercentChange(latest.totalChunks, previous.totalChunks)
      : null,
  );
  const charDeltaText = combineDeltaAndPct(
    rawCharDelta === "—" ? null : rawCharDelta,
    previous
      ? formatPercentChange(latest.totalCharacters, previous.totalCharacters)
      : null,
  );

  const metrics = [
    {
      key: "documents",
      label: "Documents",
      value: documentValue,
      deltaText: docDeltaText,
      delta: latest.deltaDocuments,
    },
    {
      key: "chunks",
      label: "Chunks",
      value: chunkValue,
      deltaText: chunkDeltaText,
      delta: latest.deltaChunks,
    },
    {
      key: "characters",
      label: "Content Size",
      value: characterPrimaryValue,
      deltaText: charDeltaText,
      delta: latest.deltaCharacters,
    },
  ];

  const shortSourceRun = shortenId(latest.runId);
  const ingestionModeLabel = formatIngestionModeLabel(latest.ingestionMode);

  const primaryMetaItems = [
    {
      label: "Captured",
      value: latest.capturedAt ? (
        <ClientSideDate value={latest.capturedAt} />
      ) : (
        "—"
      ),
      title: undefined as string | undefined,
    },
    {
      label: "Ingestion Mode",
      value: ingestionModeLabel,
      title: undefined as string | undefined,
    },
    {
      label: "Embedding Model",
      value: displayEmbeddingLabel,
      title: embeddingLabel,
    },
  ];

  return (
    <section className="ai-card space-y-4 p-5">
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardTitle icon={<FiDatabase aria-hidden="true" />}>
            Dataset Snapshot
          </CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--ai-text-muted)] transition-colors hover:text-[color:var(--ai-text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ai-role-border-subtle)] focus-visible:ring-offset-2"
                aria-label="Snapshot detail"
              >
                <FiInfo className="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Latest captured totals from the <code>rag_snapshot</code> rollup.
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-3">
        {/* KPI tiles + trend sparkline */}
        <GridPanel className="grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {metrics.map((metric) => {
            const tone =
              metric.delta === null || metric.delta === undefined
                ? undefined
                : metric.delta > 0
                  ? "success"
                  : "error";
            const valueNode =
              metric.key === "characters" ? (
                <span title={characterDetailLabel}>{metric.value}</span>
              ) : (
                metric.value
              );
            return (
              <DatasetMetricTile
                key={metric.key}
                label={metric.label}
                value={valueNode}
                delta={
                  metric.deltaText
                    ? { text: metric.deltaText, tone: tone ?? "muted" }
                    : undefined
                }
              />
            );
          })}
          <div className="ai-panel shadow-none rounded-[14px] px-3 py-2 md:col-span-2">
            <div className={styles.trendPanel}>
              <div className={styles.trendHeader}>
                <span className={styles.kpiTileTitle}>Document Trend</span>
                <span className={styles.kpiHelperText}>
                  {`Last ${historyList.length} captures`}
                </span>
              </div>
              {sparklineData ? (
                <>
                  <div className={styles.trendSparklineWrap}>
                    <div className={styles.sparklineYAxis}>
                      <span className={styles.sparklineYLabel}>
                        {numberFormatter.format(sparklineData.max)}
                      </span>
                      <span className={styles.sparklineYLabel}>
                        {numberFormatter.format(sparklineData.min)}
                      </span>
                    </div>
                    <svg
                      className="w-full h-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label="Snapshot trend sparkline"
                    >
                      <path
                        className="fill-none stroke-[color-mix(in_srgb,var(--ai-accent)_90%,transparent)] stroke-2"
                        d={sparklineData.path}
                      />
                    </svg>
                  </div>
                  <div className={styles.trendSummary}>
                    <span className={styles.kpiMetricLabel}>
                      Range:{" "}
                      {numberFormatter.format(sparklineData.min)}–
                      {numberFormatter.format(sparklineData.max)} docs
                    </span>
                    {percentChange ? (
                      <span
                        className={cn(
                          styles.percentChange,
                          isPositiveChange
                            ? styles.percentChangePositive
                            : styles.percentChangeNegative,
                        )}
                      >
                        {percentChange} vs prev.
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <span className="text-xs text-[color:var(--ai-text-muted)]">
                  More history needed for trend
                </span>
              )}
            </div>
          </div>
        </GridPanel>

        {/* Primary metadata tiles */}
        <GridPanel className="grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {primaryMetaItems.map((item) => {
            const isZeroValue =
              typeof item.value === "string" && item.value === "—";
            return (
              <div
                key={item.label}
                className={cn(
                  "ai-panel shadow-none rounded-[12px]",
                  styles.metaTile,
                )}
              >
                <dt className={styles.kpiTileTitle}>{item.label}</dt>
                <dd
                  title={item.title}
                  className={cn(
                    styles.kpiMetricValue,
                    item.title && styles.truncate,
                    isZeroValue && styles.kpiMetricValueZero,
                  )}
                >
                  {item.value}
                </dd>
              </div>
            );
          })}
        </GridPanel>

        {/* Secondary metadata row */}
        <dl className={styles.secondaryMetaRow}>
          <div className={styles.secondaryMetaItem}>
            <dt className={styles.kpiTileTitle}>Source Run</dt>
            <dd className={cn(styles.secondaryMetaValue, "font-mono")}>
              <span title={latest.runId ?? undefined}>{shortSourceRun}</span>
              {latest.runId ? <CopyButton text={latest.runId} /> : null}
            </dd>
          </div>
          <div className={styles.secondaryMetaItem}>
            <dt className={styles.kpiTileTitle}>Schema Version</dt>
            <dd className={styles.secondaryMetaValue}>
              {latest.schemaVersion ?? "—"}
            </dd>
          </div>
        </dl>

        {/* Recent snapshots */}
        <section className="ai-panel mt-2 space-y-3 shadow-none rounded-[14px] px-5 py-4">
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
          <ul className="list-none p-0 m-0">
            {historyList.map((entry, index) => {
              const snapshotSummary = formatSnapshotRowSummary(entry);
              const rowEmbeddingLabel = formatEmbeddingSpaceLabel(
                entry.embeddingSpaceId,
              );
              const rowTitle = `${formatSnapshotRowTitle(entry)} · ${rowEmbeddingLabel}`;
              const deltaParts: Array<{ text: string; positive: boolean }> = [];
              const docLabel = formatDeltaLabel(entry.deltaDocuments);
              if (docLabel) {
                deltaParts.push({
                  text: `${docLabel} docs`,
                  positive: (entry.deltaDocuments ?? 0) > 0,
                });
              }
              const chunkLabel = formatDeltaLabel(entry.deltaChunks);
              if (chunkLabel) {
                deltaParts.push({
                  text: `${chunkLabel} chunks`,
                  positive: (entry.deltaChunks ?? 0) > 0,
                });
              }
              const hasChange =
                (entry.deltaDocuments ?? 0) !== 0 ||
                (entry.deltaChunks ?? 0) !== 0;
              const chipClass = cn(
                "text-[color:var(--ai-text-muted)] border-[color:var(--ai-role-border-muted)] bg-[color:var(--ai-role-surface-0)] px-2 py-0.5 rounded-full",
                styles.snapshotChip,
                index === 0
                  ? "border-[color:var(--ai-accent-strong)] text-[color:var(--ai-accent-strong)] bg-[color:var(--ai-role-surface-1)]"
                  : "",
              );
              const isSelected = selectedSnapshotId === entry.id;
              const handleSelect = () => {
                onSelectSnapshot?.(entry);
              };
              const ariaLabel = `Snapshot captured ${entry.capturedAt ?? "unknown date"} · ${snapshotSummary}`;
              return (
                <li key={entry.id} className={styles.recentRow}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={ariaLabel}
                    title={rowTitle}
                    className={cn(
                      styles.recentRowButton,
                      isSelected && styles.recentRowSelected,
                    )}
                    onClick={handleSelect}
                  >
                    <div className={styles.snapshotRowPrimary}>
                      <span className="font-semibold text-[color:var(--ai-text-strong)]">
                        {entry.capturedAt ? (
                          <ClientSideDate value={entry.capturedAt} />
                        ) : (
                          "—"
                        )}
                      </span>
                      <span className={styles.snapshotRowSummary}>
                        <span>{snapshotSummary}</span>
                        {hasChange ? (
                          deltaParts.map((part) => (
                            <span
                              key={part.text}
                              style={{
                                color: part.positive
                                  ? "var(--ai-success)"
                                  : "var(--ai-error)",
                              }}
                            >
                              {part.text}
                            </span>
                          ))
                        ) : (
                          <span className={styles.noChangeBadge}>
                            No change
                          </span>
                        )}
                      </span>
                      <span className={chipClass}>
                        {index === 0 ? "LATEST" : `#${index + 1}`}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </CardContent>
    </section>
  );
}

export {
  formatBytesDeltaTitleValue,
  formatDeltaOrDash,
  formatDeltaTitleValue,
  formatEmbeddingDisplayLabel,
  formatSignedBytesDelta,
  shortenId,
};
