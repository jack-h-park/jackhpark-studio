import { FiActivity } from "@react-icons/all-files/fi/FiActivity";
import type { JSX } from "react";

import { getStatusLabel } from "@/lib/admin/recent-runs-filters";
import type { SystemHealthOverview } from "@/lib/admin/ingestion-types";
import {
  formatDuration,
  numberFormatter,
  runStatusVariantMap,
} from "@/lib/admin/ingestion-formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { StatCard } from "@/components/ui/stat-card";
import { StatusPill } from "@/components/ui/status-pill";
import { ClientSideDate } from "./client-side-date";

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
          <StatCard
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
          <StatCard
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
          <StatCard
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
              <span className="ai-meta-text  italic">
                Derived from the latest run.
              </span>
            }
          />
          <StatCard
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
          <StatCard
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
