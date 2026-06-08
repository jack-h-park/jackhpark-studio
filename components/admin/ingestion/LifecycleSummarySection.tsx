import type { JSX } from "react";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";

import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardStatTile } from "@/components/ui/dashboard-stat-tile";
import { GridPanel } from "@/components/ui/grid-panel";
import { numberFormatter } from "@/lib/admin/ingestion-formatters";

type LifecycleSummaryProps = {
  recentMissingCount: number;
  softDeletedCount: number;
  recentAuthErrorCount: number;
  recentWindowLabel: string;
};

export function LifecycleSummarySection({
  recentMissingCount,
  softDeletedCount,
  recentAuthErrorCount,
  recentWindowLabel,
}: LifecycleSummaryProps): JSX.Element {
  const tiles = [
    {
      key: "missing",
      label: `Missing Docs (${recentWindowLabel})`,
      count: recentMissingCount,
      alertDelta: recentMissingCount > 0 ? "May need re-sync" : null,
    },
    {
      key: "deleted",
      label: "Soft Deleted",
      count: softDeletedCount,
      alertDelta: null,
    },
    {
      key: "auth",
      label: `Auth Errors (${recentWindowLabel})`,
      count: recentAuthErrorCount,
      alertDelta:
        recentAuthErrorCount > 0 ? "Check source permissions" : null,
    },
  ];

  return (
    <section className="ai-card space-y-4 p-5">
      <CardHeader className="gap-1">
        <CardTitle icon={<FiAlertTriangle aria-hidden="true" />}>
          Lifecycle Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <GridPanel className="grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          {tiles.map((tile) => {
            const isZero = tile.count === 0;
            const value = isZero
              ? "—"
              : numberFormatter.format(tile.count);
            return (
              <DashboardStatTile
                key={tile.key}
                label={tile.label}
                value={value}
                valueTone={isZero ? "muted" : "strong"}
                delta={
                  tile.alertDelta
                    ? { text: tile.alertDelta, tone: "error" }
                    : undefined
                }
                sectionHint="Lifecycle Summary"
              />
            );
          })}
        </GridPanel>
      </CardContent>
    </section>
  );
}
