import type { JSX, ReactNode } from "react";
import { FiActivity } from "@react-icons/all-files/fi/FiActivity";

import type { SystemHealthOverview } from "@/lib/admin/ingestion-types";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientSideDate } from "@/components/ui/client-side-date";
import { GridPanel } from "@/components/ui/grid-panel";
import insetPanelStyles from "@/components/ui/inset-panel.module.css";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/components/ui/utils";
import {
  formatDuration,
  numberFormatter,
  runStatusVariantMap,
} from "@/lib/admin/ingestion-formatters";
import { getStatusLabel } from "@/lib/admin/recent-runs-filters";

type SystemHealthStatTileProps = {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
};

function SystemHealthStatTile({
  label,
  value,
  meta,
}: SystemHealthStatTileProps): JSX.Element {
  return (
    <div
      className={cn(
        insetPanelStyles.insetPanel,
        "h-full p-3 flex flex-col justify-between",
      )}
    >
      <div>
        <p className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
          {label}
        </p>
        <div className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
          {value}
        </div>
      </div>
      {meta ? (
        <div className="mt-3 space-y-1 text-xs text-[color:var(--ai-text-muted)]">
          {meta}
        </div>
      ) : null}
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

  return (
    <section className="ai-card space-y-6 p-6">
      <CardHeader>
        <CardTitle icon={<FiActivity aria-hidden="true" />}>
          System Health
        </CardTitle>
        <p className="ai-card-description">
          Operational signals from the latest ingestion run and queue state.
        </p>
      </CardHeader>
      <CardContent>
        <GridPanel className="grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <SystemHealthStatTile
            label="Last Run"
            value={
              <StatusPill
                variant={runStatusVariantMap[health.status] ?? "muted"}
              >
                {statusLabel}
              </StatusPill>
            }
            meta={
              health.runId ? (
                <div className="space-y-1">
                  <div className="ai-meta-text">
                    Run ID:{" "}
                    <code className="font-mono text-xs bg-[color:var(--ai-border-soft)] px-1.5 py-0.5 rounded-md">
                      {health.runId}
                    </code>
                  </div>
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
                      Snapshot:{" "}
                      <ClientSideDate value={health.snapshotCapturedAt} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <span className="ai-meta-text">No runs recorded yet.</span>
              )
            }
          />
          <SystemHealthStatTile
            label="Duration"
            value={formatDuration(health.durationMs)}
            meta={
              health.startedAt ? (
                <div className="space-y-1">
                  <span className="ai-meta-text">Started:</span>
                  <span className="ai-meta-text">
                    <ClientSideDate value={health.startedAt} />
                  </span>
                </div>
              ) : (
                <span className="ai-meta-text">—</span>
              )
            }
          />
          <SystemHealthStatTile
            label="Data Quality"
            value={
              <div className="space-y-1">
                <span className="ai-meta-text block">
                  Errors: {numberFormatter.format(health.errorCount ?? 0)}
                </span>
                <span className="ai-meta-text block">
                  Skipped Docs:{" "}
                  {numberFormatter.format(health.documentsSkipped ?? 0)}
                </span>
              </div>
            }
            meta={
              <span className="ai-meta-text italic">
                Derived from the latest run.
              </span>
            }
          />
          <SystemHealthStatTile
            label="Queue Health"
            value={
              <div className="space-y-1">
                <span className="ai-meta-text block">
                  Queue Depth: {health.queueDepth ?? "—"}
                </span>
                <span className="ai-meta-text block">
                  Pending Runs: {health.pendingRuns ?? "—"}
                </span>
                <span className="ai-meta-text block">
                  Retry Count: {health.retryCount ?? "—"}
                </span>
              </div>
            }
            meta={
              <span className="ai-meta-text italic">
                Captured when the snapshot was recorded.
              </span>
            }
          />
          <SystemHealthStatTile
            label="Last Failure"
            value={
              health.lastFailureRunId ? (
                <StatusPill
                  variant={
                    runStatusVariantMap[health.lastFailureStatus ?? "failed"] ??
                    "muted"
                  }
                >
                  {health.lastFailureStatus
                    ? getStatusLabel(health.lastFailureStatus)
                    : "Failed"}
                </StatusPill>
              ) : (
                <span className="ai-meta-text font-normal italic">
                  No failures recorded.
                </span>
              )
            }
            meta={
              health.lastFailureRunId ? (
                <div className="space-y-1">
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
              ) : null
            }
          />
        </GridPanel>
      </CardContent>
    </section>
  );
}
