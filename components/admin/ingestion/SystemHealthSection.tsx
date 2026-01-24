import type { JSX, ReactNode } from "react";
import { FiActivity } from "@react-icons/all-files/fi/FiActivity";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";

import type { SystemHealthOverview } from "@/lib/admin/ingestion-types";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientSideDate } from "@/components/ui/client-side-date";
import { GridPanel } from "@/components/ui/grid-panel";
import insetPanelStyles from "@/components/ui/inset-panel.module.css";
import { StatusPill } from "@/components/ui/status-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/components/ui/utils";
import {
  formatDuration,
  formatKpiValue,
  runStatusVariantMap,
} from "@/lib/admin/ingestion-formatters";
import { getStatusLabel } from "@/lib/admin/recent-runs-filters";

import styles from "./SystemHealthSection.module.css";

type SystemHealthStatTileProps = {
  label: ReactNode;
  value: ReactNode;
  tooltip?: ReactNode;
  isValueMuted?: boolean;
  valueClassName?: string;
};

function SystemHealthStatTile({
  label,
  value,
  tooltip,
  isValueMuted,
  valueClassName,
}: SystemHealthStatTileProps): JSX.Element {
  const baseValueClass = valueClassName ?? styles.kpiValueText;
  const valueClasses = cn(baseValueClass, isValueMuted && styles.kpiValueMuted);

  return (
    <div
      className={cn(insetPanelStyles.insetPanel, styles.kpiTile)}
    >
      <div className={styles.kpiHeaderRow}>
        <p className={styles.kpiLabel}>{label}</p>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--ai-text-muted)] transition-colors hover:text-[color:var(--ai-text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ai-border-soft)] focus-visible:ring-offset-2"
                aria-label="View details"
              >
                <FiInfo className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className={styles.kpiValueRow}>
        <div className={valueClasses}>{value}</div>
      </div>
    </div>
  );
}

export function SystemHealthSection({
  health,
}: {
  health: SystemHealthOverview;
}): JSX.Element {
  const statusLabel =
    health.status === "unknown" ? "Unknown" : getStatusLabel(health.status);
  const runTimestamp = health.endedAt ?? health.startedAt;
  const lastFailureTimestamp = health.lastFailureAt;

  const runTooltip =
    health.runId || runTimestamp || health.snapshotCapturedAt ? (
      <div className="space-y-1 text-xs text-[color:var(--ai-text-muted)]">
        {health.runId ? (
          <div className="ai-meta-text">
            Run ID:{" "}
            <code className="font-mono text-xs bg-[color:var(--ai-border-soft)] px-1.5 py-0.5 rounded-md">
              {health.runId}
            </code>
          </div>
        ) : null}
        <div className="ai-meta-text">
          Updated:{" "}
          {runTimestamp ? (
            <ClientSideDate value={runTimestamp} />
          ) : (
            "—"
          )}
        </div>
        {health.snapshotCapturedAt ? (
          <div className="ai-meta-text">
            Snapshot: <ClientSideDate value={health.snapshotCapturedAt} />
          </div>
        ) : null}
      </div>
    ) : undefined;

  const durationTooltip = health.startedAt ? (
    <div className="space-y-1 text-xs text-[color:var(--ai-text-muted)]">
      <span className="ai-meta-text">Started:</span>
      <span className="ai-meta-text">
        <ClientSideDate value={health.startedAt} />
      </span>
    </div>
  ) : undefined;

  const dataQualityTooltip = (
    <span className="text-xs text-[color:var(--ai-text-muted)]">
      Derived from the latest run.
    </span>
  );

  const queueTooltip = (
    <span className="text-xs text-[color:var(--ai-text-muted)]">
      Captured when the snapshot was recorded.
    </span>
  );

  const lastFailureTooltip = health.lastFailureRunId ? (
    <div className="space-y-1 text-xs text-[color:var(--ai-text-muted)]">
      <span className="ai-meta-text">
        Run ID:{" "}
        <code className="font-mono text-xs bg-[color:var(--ai-border-soft)] px-1.5 py-0.5 rounded-md">
          {health.lastFailureRunId}
        </code>
      </span>
      <span className="ai-meta-text">
        At:{" "}
        {lastFailureTimestamp ? (
          <ClientSideDate value={lastFailureTimestamp} />
        ) : (
          "—"
        )}
      </span>
    </div>
  ) : undefined;

  const lastFailureVariant =
    runStatusVariantMap[health.lastFailureStatus ?? "failed"] ?? "muted";
  const lastFailureLabel = health.lastFailureStatus
    ? getStatusLabel(health.lastFailureStatus)
    : "Failed";
  const lastFailureValueClassName = health.lastFailureRunId
    ? styles.kpiValuePillWrap
    : styles.kpiValueFallback;

  const errorsValue = formatKpiValue(health.errorCount);
  const skippedDocsValue = formatKpiValue(health.documentsSkipped);
  const queueDepthValue = formatKpiValue(health.queueDepth);
  const pendingRunsValue = formatKpiValue(health.pendingRuns);
  const retryCountValue = formatKpiValue(health.retryCount);

  const coreKpis = [
    {
      key: "lastRun",
      label: "Last Run",
      value: (
        <StatusPill variant={runStatusVariantMap[health.status] ?? "muted"}>
          {statusLabel}
        </StatusPill>
      ),
      tooltip: runTooltip,
      valueClassName: styles.kpiValuePillWrap,
    },
    {
      key: "duration",
      label: "Duration",
      value: formatDuration(health.durationMs),
      tooltip: durationTooltip,
    },
    {
      key: "errors",
      label: "Errors",
      value: errorsValue,
      tooltip: dataQualityTooltip,
      isValueMuted: errorsValue === "—",
    },
    {
      key: "skipped",
      label: "Docs Skipped",
      value: skippedDocsValue,
      tooltip: dataQualityTooltip,
      isValueMuted: skippedDocsValue === "—",
    },
  ];

  const secondaryKpis = [
    {
      key: "queueDepth",
      label: "Queue Depth",
      value: queueDepthValue,
      tooltip: queueTooltip,
      isValueMuted: queueDepthValue === "—",
    },
    {
      key: "pendingRuns",
      label: "Pending Runs",
      value: pendingRunsValue,
      tooltip: queueTooltip,
      isValueMuted: pendingRunsValue === "—",
    },
    {
      key: "retryCount",
      label: "Retry Count",
      value: retryCountValue,
      tooltip: queueTooltip,
      isValueMuted: retryCountValue === "—",
    },
    {
      key: "lastFailure",
      label: "Last Failure",
      value: health.lastFailureRunId ? (
        <StatusPill variant={lastFailureVariant}>
          {lastFailureLabel}
        </StatusPill>
      ) : (
        <span className="ai-meta-text font-normal italic">
          No failures recorded.
        </span>
      ),
      tooltip: lastFailureTooltip,
      valueClassName: lastFailureValueClassName,
    },
  ];

  const kpiTiles = [...coreKpis, ...secondaryKpis];

  return (
    <section className="ai-card space-y-6 p-5">
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <CardTitle icon={<FiActivity aria-hidden="true" />}>
            System Health
          </CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--ai-text-muted)] transition-colors hover:text-[color:var(--ai-text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ai-border-soft)] focus-visible:ring-offset-2"
                aria-label="System health overview info"
              >
                <FiInfo className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Operational signals from the latest ingestion run and queue
              state.
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-3">
        <GridPanel className={styles.kpiGrid}>
          {kpiTiles.map((tile) => (
            <SystemHealthStatTile
              key={tile.key}
              label={tile.label}
              value={tile.value}
              tooltip={tile.tooltip}
              isValueMuted={tile.isValueMuted}
              valueClassName={tile.valueClassName}
            />
          ))}
        </GridPanel>
      </CardContent>
    </section>
  );
}
