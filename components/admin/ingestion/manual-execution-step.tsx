import type { JSX } from "react";

import type { ManualIngestionHookState } from "@/hooks/useManualIngestion";
import { WorkflowStep } from "@/components/admin/workflow";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";

import manualStyles from "./ManualIngestionPanel.module.css";

export type ManualExecutionStepProps = {
  ingestion: ManualIngestionHookState;
};

export function ManualExecutionStep({
  ingestion,
}: ManualExecutionStepProps): JSX.Element {
  const totalPages = ingestion.overallProgress.total;
  const stagePercent = Math.max(0, Math.min(100, ingestion.progress));
  const activePageTitle = ingestion.overallProgress.title ?? null;
  const activePageId = ingestion.overallProgress.pageId ?? null;
  const queuedCompletedPages =
    totalPages > 0 ? Math.max(0, ingestion.overallProgress.current - 1) : 0;
  const isTerminal =
    ingestion.hasCompleted && ingestion.status !== "in_progress";
  const finalSnapshot = ingestion.finalQueueSnapshot;
  const plannedTotalSnapshot = finalSnapshot?.plannedTotal ?? totalPages;
  const processedFromSnapshot =
    finalSnapshot?.processed ?? ingestion.stats?.documentsProcessed ?? null;
  const finalProcessedValue = processedFromSnapshot ?? 0;
  const finalTotal = isTerminal
    ? Math.max(plannedTotalSnapshot, finalProcessedValue, totalPages)
    : totalPages;
  const finalCompleted = isTerminal
    ? finalProcessedValue
    : queuedCompletedPages;
  const displayTotal = finalTotal;
  const displayTotalKnown = displayTotal > 0;
  const boundedCompleted = displayTotalKnown
    ? Math.min(finalCompleted, displayTotal)
    : finalCompleted;
  const stageSubtitle = activePageTitle ?? activePageId;
  const totalLabel = displayTotalKnown ? displayTotal.toString() : "?";
  const overallFractionLabel = `${boundedCompleted} / ${totalLabel}`;
  const overallPct = displayTotalKnown
    ? Math.round((boundedCompleted / displayTotal) * 100)
    : null;
  const ongoingOverallPercent = displayTotalKnown
    ? Math.min(
        100,
        Math.max(
          0,
          ((boundedCompleted + stagePercent / 100) / displayTotal) * 100,
        ),
      )
    : stagePercent;
  const totalsMismatch =
    isTerminal &&
    finalSnapshot !== null &&
    finalSnapshot.plannedTotal !== finalSnapshot.processed;
  const overallBarPercent = isTerminal ? 100 : ongoingOverallPercent;
  const showOverallProgress = displayTotal > 1;
  const currentPagePercent = Number.isFinite(stagePercent)
    ? stagePercent
    : null;
  const hasCurrentPercentValue =
    ingestion.isRunning || ingestion.hasCompleted || currentPagePercent === 100;
  const showCurrentPercentPill =
    currentPagePercent !== null && hasCurrentPercentValue;

  return (
    <WorkflowStep
      title="Execution"
      hint="Runs on the server and streams logs below."
      seam="bottom"
    >
      <div className={manualStyles.executionStrip}>
        <Button
          type="submit"
          variant="gradient"
          disabled={ingestion.isRunning}
          className="min-w-[170px]"
          data-rail="execution-button"
        >
          {ingestion.isRunning ? "Running" : "Run manually"}
        </Button>

        <div
          className={manualStyles.executionProgressColumn}
          aria-live="polite"
        >
          {/* Screenshot checklist: Execution progress module (light/dark); verify running bar, terminal 100%, mismatch note when totals differ. */}
          <div className={manualStyles.executionProgressStack}>
            {showOverallProgress ? (
              <div
                ref={ingestion.overallProgressRef}
                className={manualStyles.executionProgressRow}
              >
                <div className={manualStyles.executionRowHeader}>
                  <div
                    className={manualStyles.overallLabelCluster}
                    aria-hidden="true"
                  >
                    <p className="text-sm font-normal ai-text-strong">
                      Overall Progress
                    </p>
                    <span className={manualStyles.overallHelperText}>
                      pages completed
                    </span>
                    {totalsMismatch ? (
                      <span className={manualStyles.overallTotalsHint}>
                        · based on processed total
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={manualStyles.executionOverallKpi}
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className={cn(
                        manualStyles.executionKpiPrimary,
                        manualStyles.tabularNums,
                      )}
                    >
                      {overallFractionLabel}
                    </span>
                    {overallPct !== null ? (
                      <span
                        className={cn(
                          manualStyles.executionKpiSecondary,
                          manualStyles.tabularNums,
                        )}
                      >
                        ({overallPct}%)
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className={manualStyles.executionProgressBar}>
                  <span
                    className={manualStyles.executionProgressBarFill}
                    style={{ width: `${overallBarPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className={manualStyles.executionProgressRow}>
              <div className={manualStyles.currentHeaderRow}>
                <p className="text-sm font-normal ai-text-strong">
                  Current Page
                </p>
                {stageSubtitle ? (
                  <span
                    className={cn(
                      manualStyles.currentTitle,
                      manualStyles.currentTitleMuted,
                    )}
                    title={stageSubtitle}
                  >
                    {stageSubtitle}
                  </span>
                ) : (
                  <span
                    className={manualStyles.currentTitle}
                    aria-hidden="true"
                  >
                    {"\u00A0"}
                  </span>
                )}
                {showCurrentPercentPill && currentPagePercent !== null ? (
                  <span
                    className={cn(
                      manualStyles.currentPercentPill,
                      manualStyles.tabularNums,
                    )}
                  >
                    {Math.round(currentPagePercent)}%
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={manualStyles.currentPercentPillPlaceholder}
                  >
                    {"\u00A0"}
                  </span>
                )}
              </div>
              <div className={manualStyles.executionProgressBar}>
                <span
                  className={manualStyles.executionProgressBarFill}
                  style={{ width: `${stagePercent}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {showOverallProgress && activePageId && activePageTitle ? (
                  <span className={manualStyles.pageIdBadge}>
                    {activePageId}
                  </span>
                ) : null}
                {ingestion.finalMessage ? (
                  <span className="ai-meta-text">
                    {ingestion.finalMessage}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkflowStep>
  );
}
