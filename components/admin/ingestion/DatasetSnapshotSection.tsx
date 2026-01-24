import type { JSX, ReactNode } from "react";
import { FiClock } from "@react-icons/all-files/fi/FiClock";
import { FiDatabase } from "@react-icons/all-files/fi/FiDatabase";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";

import type { DatasetSnapshotOverview } from "@/lib/admin/ingestion-types";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientSideDate } from "@/components/ui/client-side-date";
import { GridPanel } from "@/components/ui/grid-panel";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import insetPanelStyles from "@/components/ui/inset-panel.module.css";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/components/ui/utils";
import {
  buildSparklineData,
  formatBytesFromCharacters,
  formatCharacterCountLabel,
  formatDeltaLabel,
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
  const trimmed =
    `${provider} ${model}`
      .split(/\s+/)
      .join(" ")
      .trim() || label;
  return version ? `${trimmed} ${version}` : trimmed;
};

const formatDeltaOrDash = (value: number | null | undefined) => {
  const formatted = formatDeltaLabel(value);
  return formatted ?? "—";
};

const formatSignedBytesDelta = (value: number | null | undefined) => {
  if (!value) {
    return "—";
  }
  const formatted = formatBytesFromCharacters(Math.abs(value));
  return `${value > 0 ? "+" : "-"}${formatted}`;
};

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

type SnapshotEntry = DatasetSnapshotOverview["history"][number];

const datasetMetricToneClasses: Record<
  "success" | "warning" | "error" | "info" | "muted",
  string
> = {
  success: "text-[var(--ai-success)]",
  warning: "text-[var(--ai-warning)]",
  error: "text-[var(--ai-error)]",
  info: "text-[var(--ai-accent)]",
  muted: "text-[var(--ai-text-soft)]",
};

type DatasetMetricDelta = {
  text: string;
  tone?: "success" | "warning" | "error" | "info" | "muted";
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
    <div
      className={cn(
        insetPanelStyles.insetPanel,
        "h-full p-2.5 flex flex-col justify-between gap-1.5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <dt className="text-[0.65rem] uppercase tracking-[0.3em] text-[color:var(--ai-text-muted)]">
          {label}
        </dt>
        {delta ? (
          <span
            className={cn(
              "text-xs font-semibold tracking-wide",
              datasetMetricToneClasses[delta.tone ?? "muted"],
            )}
          >
            {delta.text}
          </span>
        ) : null}
      </div>
      <dd
        className="text-2xl font-semibold text-[color:var(--ai-text-strong)]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </dd>
    </div>
  );
}

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

  const documentValue = formatKpiValue(latest.totalDocuments);
  const chunkValue = formatKpiValue(latest.totalChunks);
  const characterPrimaryValue = formatBytesFromCharacters(latest.totalCharacters);
  const characterDetailLabel = formatCharacterCountLabel(latest.totalCharacters);
  const displayEmbeddingLabel = formatEmbeddingDisplayLabel(embeddingLabel);

  const metrics = [
    {
      key: "documents",
      label: "Documents",
      value: documentValue,
      delta: latest.deltaDocuments,
    },
    {
      key: "chunks",
      label: "Chunks",
      value: chunkValue,
      delta: latest.deltaChunks,
    },
    {
      key: "characters",
      label: "Characters",
      value: characterPrimaryValue,
      delta: latest.deltaCharacters,
    },
  ];

  const shortSourceRun = shortenId(latest.runId);
  const metadataItems = [
    {
      label: "Embedding Model",
      value: displayEmbeddingLabel,
      title: embeddingLabel,
    },
    {
      label: "Ingestion Mode",
      value: latest.ingestionMode ?? "—",
    },
    {
      label: "Captured",
      value: latest.capturedAt ? (
        <ClientSideDate value={latest.capturedAt} />
      ) : (
        "—"
      ),
    },
    {
      label: "Source Run",
      value: shortSourceRun,
      title: latest.runId ?? undefined,
    },
    {
      label: "Schema Version",
      value: latest.schemaVersion ?? "—",
    },
  ];

  const docDeltaValue = formatDeltaOrDash(latest.deltaDocuments);
  const chunkDeltaValue = formatDeltaOrDash(latest.deltaChunks);
  const sizeDeltaValue = formatSignedBytesDelta(latest.deltaCharacters);

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
                className="flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--ai-text-muted)] transition-colors hover:text-[color:var(--ai-text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ai-border-soft)] focus-visible:ring-offset-2"
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
      <CardContent className="space-y-6 p-3">
        <GridPanel className="grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {metrics.map((metric) => {
            const deltaLabel = formatDeltaLabel(metric.delta);
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
                  deltaLabel
                    ? { text: deltaLabel, tone: tone ?? "muted" }
                    : undefined
                }
              />
            );
          })}
          <div className="ai-panel shadow-none rounded-[14px] px-3 py-2 md:col-span-2">
            <div className={`${styles.trendPanel}`}>
              <div className={styles.trendHeader}>
                <span>Trend</span>
                <span className={styles.trendCaption}>
                  Last {historyList.length} captures
                </span>
              </div>
              {sparklineData ? (
                <>
                  <div className={styles.trendSparklineWrap}>
                    <svg
                      className="w-full h-full"
                      viewBox="0 0 100 100"
                      role="img"
                      aria-label="Snapshot trend sparkline"
                    >
                      <path
                        className="fill-none stroke-[color-mix(in_srgb,var(--ai-accent)_90%,transparent)] stroke-2"
                        d={sparklineData.path}
                      />
                    </svg>
                  </div>
                  <div className={styles.trendMinMax}>
                    <span>Min {numberFormatter.format(sparklineData.min)}</span>
                    <span>Max {numberFormatter.format(sparklineData.max)}</span>
                  </div>
                  <div className={styles.trendFooter}>
                    <span>Δ Docs {docDeltaValue}</span>
                    <span>Δ Chunks {chunkDeltaValue}</span>
                    <span>Δ Size {sizeDeltaValue}</span>
                    {percentChange ? (
                      <span className="text-[0.55rem] tracking-[0.2em] uppercase">
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
        <GridPanel className="grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {metadataItems.map((item) => (
              <div
                key={item.label}
                className="ai-panel shadow-none rounded-[12px] px-4 py-3"
              >
                <dt className="m-0 ai-label-overline tracking-wide text-[color:var(--ai-text-muted)]">
                  {item.label}
                </dt>
                <dd
                  title={item.title}
                  className="mt-0.5 text-sm text-[color:var(--ai-text-soft)]"
                >
                  {item.value}
                </dd>
              </div>
          ))}
        </GridPanel>
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
              const embeddingLabel = formatEmbeddingSpaceLabel(
                entry.embeddingSpaceId,
              );
              const rowTitle = `${formatSnapshotRowTitle(entry)} · ${embeddingLabel}`;
              const chipClass = cn(
                "text-[color:var(--ai-text-muted)] border-[color:var(--ai-role-border-muted)] bg-[color:var(--ai-role-surface-0)] px-2 py-0.5 rounded-full",
                styles.snapshotChip,
                index === 0
                  ? "border-[color:var(--ai-accent-strong)] text-[color:var(--ai-accent-strong)] bg-[color:var(--ai-role-surface-1)]"
                  : "",
              );
              return (
                <li
                  key={entry.id}
                  className={styles.recentRow}
                  title={rowTitle}
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
                      {snapshotSummary}
                    </span>
                    <span className={chipClass}>
                      {index === 0 ? "LATEST" : `#${index + 1}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </CardContent>
    </section>
  );
}
