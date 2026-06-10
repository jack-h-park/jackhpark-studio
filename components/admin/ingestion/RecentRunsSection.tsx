import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { type JSX, useCallback } from "react";

import type { RunRecord } from "@/lib/admin/ingestion-runs";
import type { RecentRunsSnapshot } from "@/lib/admin/ingestion-types";
import { RecentRunsFilters } from "@/components/admin/ingestion/recent-runs-filters";
import { RecentRunsTable } from "@/components/admin/ingestion/recent-runs-table";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecentRuns } from "@/hooks/useRecentRuns";
import { getStringMetadata } from "@/lib/admin/ingestion-metadata";

import recentStyles from "./RecentRunsPanel.module.css";

export function RecentRunsSection({
  initial,
}: {
  initial: RecentRunsSnapshot;
}): JSX.Element {
  const runsState = useRecentRuns(initial);

  const resolvePageUrl = useCallback((run: RunRecord) => {
    const publicPageUrl = getStringMetadata(run.metadata, "publicPageUrl");
    const pageUrl = publicPageUrl ?? getStringMetadata(run.metadata, "pageUrl");
    const fallbackUrl = getStringMetadata(run.metadata, "url");
    return pageUrl ?? fallbackUrl ?? null;
  }, []);

  return (
    <section id="recent-runs" className="ai-card space-y-4 p-6">
      <CardHeader className={recentStyles.panelHeaderRow}>
        <div>
          <CardTitle icon={<FiLayers aria-hidden="true" />}>
            Recent Runs
          </CardTitle>
          <p className={recentStyles.panelSubtitle}>
            Latest ingestion activity from manual and scheduled jobs.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={recentStyles.filtersPanel}>
          <RecentRunsFilters
            statusFilter={runsState.statusFilter}
            ingestionTypeFilter={runsState.ingestionTypeFilter}
            sourceFilter={runsState.sourceFilter}
            embeddingProviderFilter={runsState.embeddingProviderFilter}
            startedFromFilter={runsState.startedFromFilter}
            startedToFilter={runsState.startedToFilter}
            hideSkipped={runsState.hideSkipped}
            isLoading={runsState.isLoading}
            canReset={runsState.canReset}
            activeFilterCount={runsState.activeFilterCount}
            statusOptions={runsState.statusOptions}
            ingestionTypeOptions={runsState.ingestionTypeOptions}
            sourceOptions={runsState.sourceOptions}
            embeddingProviderOptions={runsState.embeddingProviderOptions}
            onStatusChange={runsState.handleStatusChange}
            onIngestionTypeChange={runsState.handleIngestionTypeChange}
            onSourceChange={runsState.handleSourceChange}
            onEmbeddingProviderChange={runsState.handleEmbeddingProviderChange}
            onStartedFromChange={runsState.handleStartedFromChange}
            onStartedToChange={runsState.handleStartedToChange}
            onHideSkippedChange={runsState.handleHideSkippedChange}
            onResetFilters={runsState.handleResetFilters}
          />
        </div>
        <RecentRunsTable
          runs={runsState.runs}
          isLoading={runsState.isLoading}
          error={runsState.error}
          page={runsState.page}
          pageSize={runsState.pageSize}
          totalCount={runsState.totalCount}
          totalPages={runsState.totalPages}
          hasFiltersApplied={runsState.hasFiltersApplied}
          activeFilterCount={runsState.activeFilterCount}
          expandedRunIds={runsState.expandedRunIds}
          deletingRunIds={runsState.deletingRunIds}
          resolvePageUrl={resolvePageUrl}
          onToggleRunDetails={runsState.toggleRunDetails}
          onDeleteRun={runsState.handleDeleteRunClick}
          onPageChange={runsState.handlePageChange}
          onResetFilters={runsState.handleResetFilters}
        />
      </CardContent>
    </section>
  );
}
