import type { JSX } from "react";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiBarChart2 } from "@react-icons/all-files/fi/FiBarChart2";

import type { ManualIngestionHookState } from "@/hooks/useManualIngestion";
import { CardTitle } from "@/components/ui/card";
import {
  DashboardStatTile,
  type DashboardStatTone,
} from "@/components/ui/dashboard-stat-tile";
import { cn } from "@/components/ui/utils";
import {
  formatBytesFromCharacters,
  numberFormatter,
} from "@/lib/admin/ingestion-formatters";

import manualStyles from "./ManualIngestionPanel.module.css";

type RunSummaryStatTileProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  numericValue?: number;
  className?: string;
  delta?: {
    text: string;
    tone?: DashboardStatTone;
  };
  sectionHint?: string;
};

function RunSummaryStatTile({
  label,
  value,
  numericValue,
  className,
  delta,
  sectionHint,
}: RunSummaryStatTileProps): JSX.Element {
  const isZeroValue = typeof numericValue === "number" && numericValue === 0;
  return (
    <DashboardStatTile
      label={label}
      value={value}
      delta={delta}
      className={cn(
        manualStyles.runSummaryStatTile,
        className,
        isZeroValue && manualStyles.metricCardZero,
      )}
      valueTone={isZeroValue ? "muted" : "strong"}
      sectionHint={sectionHint}
    />
  );
}

export type ManualRunSummaryProps = {
  stats: NonNullable<ManualIngestionHookState["stats"]>;
};

export function ManualRunSummary({
  stats,
}: ManualRunSummaryProps): JSX.Element {
  const formatMetricValue = (value: number) => (
    <span className={manualStyles.tabularNums}>
      {numberFormatter.format(value)}
    </span>
  );
  const runSummaryHeaderSuffix: React.ReactNode | null =
    stats.errorCount > 0 ? (
      <>{formatMetricValue(stats.errorCount)} errors</>
    ) : stats.documentsAdded + stats.documentsUpdated > 0 ? (
      <>
        {formatMetricValue(stats.documentsAdded)} added ·{" "}
        {formatMetricValue(stats.documentsUpdated)} updated ·{" "}
        {formatMetricValue(stats.documentsSkipped)} skipped
      </>
    ) : (
      "no changes detected"
    );

  return (
    <section
      className={cn("ai-panel mt-8 space-y-3", manualStyles.runSummaryPanel)}
    >
      <div>
        <CardTitle icon={<FiBarChart2 aria-hidden="true" />}>
          Run Summary
        </CardTitle>
      </div>
      <p
        className={cn(
          "text-sm text-[color:var(--ai-text-muted)]",
          manualStyles.runSummaryHeader,
        )}
      >
        {stats.errorCount > 0
          ? `Completed with failures — Failed ${stats.errorCount}`
          : `Processed ${formatMetricValue(stats.documentsProcessed)} documents — `}
        {stats.errorCount > 0 ? null : runSummaryHeaderSuffix}
      </p>
      {/* Verification: header for zero/mixed/error states; zero cards quiet; errors weight >0. */}
      <div className={manualStyles.runSummaryGroups}>
        <div className={manualStyles.runSummaryGroup}>
          <p className={manualStyles.runSummaryGroupLabel}>Document Outcome</p>
          <div className={manualStyles.runSummaryGrid}>
            <RunSummaryStatTile
              label="Documents Processed"
              value={formatMetricValue(stats.documentsProcessed)}
              numericValue={stats.documentsProcessed}
              sectionHint="Run Summary"
            />
            <RunSummaryStatTile
              label="Documents Updated"
              value={formatMetricValue(stats.documentsUpdated)}
              numericValue={stats.documentsUpdated}
              sectionHint="Run Summary"
            />
            <RunSummaryStatTile
              label="Documents Added"
              value={formatMetricValue(stats.documentsAdded)}
              numericValue={stats.documentsAdded}
              sectionHint="Run Summary"
            />
            <RunSummaryStatTile
              label="Documents Skipped"
              value={formatMetricValue(stats.documentsSkipped)}
              numericValue={stats.documentsSkipped}
              sectionHint="Run Summary"
            />
          </div>
        </div>
        <div className={manualStyles.runSummaryGroup}>
          <p className={manualStyles.runSummaryGroupLabel}>Index Impact</p>
          <div className={manualStyles.runSummaryGrid}>
            <RunSummaryStatTile
              label="Chunks Added"
              value={formatMetricValue(stats.chunksAdded)}
              numericValue={stats.chunksAdded}
              sectionHint="Run Summary"
            />
            <RunSummaryStatTile
              label="Chunks Updated"
              value={formatMetricValue(stats.chunksUpdated)}
              numericValue={stats.chunksUpdated}
              sectionHint="Run Summary"
            />
            <RunSummaryStatTile
              label="Content Added"
              value={formatBytesFromCharacters(stats.charactersAdded)}
              numericValue={stats.charactersAdded}
              sectionHint="Run Summary"
            />
            <RunSummaryStatTile
              label="Content Updated"
              value={formatBytesFromCharacters(stats.charactersUpdated)}
              numericValue={stats.charactersUpdated}
              sectionHint="Run Summary"
            />
          </div>
        </div>
        <div className={manualStyles.runSummaryGroup}>
          <p className={manualStyles.runSummaryGroupLabel}>Health</p>
          {stats.errorCount > 0 ? (
            <div
              className={cn(
                manualStyles.runSummaryGrid,
                manualStyles.healthGrid,
              )}
            >
              <RunSummaryStatTile
                label={
                  <span className="flex items-center gap-1">
                    <FiAlertTriangle
                      aria-hidden="true"
                      className="h-4 w-4 text-[color:var(--ai-warning)]"
                    />
                    <span>Errors</span>
                  </span>
                }
                value={formatMetricValue(stats.errorCount)}
                numericValue={stats.errorCount}
                sectionHint="Run Summary"
              />
            </div>
          ) : (
            <div className={manualStyles.healthEmptyState}>
              <span className="ai-meta-text text-[color:var(--ai-text-muted)]">
                No errors detected
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
