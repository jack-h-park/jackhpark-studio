import { FiChevronDown } from "@react-icons/all-files/fi/FiChevronDown";
import { FiExternalLink } from "@react-icons/all-files/fi/FiExternalLink";
import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { type JSX, useCallback, useMemo } from "react";

import type { RunRecord, RunStatus } from "@/lib/admin/ingestion-runs";
import type { ModelProvider } from "@/lib/shared/model-provider";
import { RunDetailRow } from "@/components/admin/ingestion/run-detail-row";
import { Button } from "@/components/ui/button";
import { ClientSideDate } from "@/components/ui/client-side-date";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorLogSummary } from "@/components/ui/error-log-summary";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/components/ui/utils";
import {
  formatCharacters,
  formatDuration,
  numberFormatter,
  runStatusVariantMap,
} from "@/lib/admin/ingestion-formatters";
import { getEmbeddingSpaceIdFromMetadata } from "@/lib/admin/ingestion-metadata";
import { getEmbeddingSpaceOption } from "@/lib/admin/recent-runs-filters";

import recentStyles from "./RecentRunsPanel.module.css";

const EMBEDDING_PROVIDER_BADGES: Record<ModelProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  ollama: "Ollama",
  lmstudio: "LM Studio",
};

function getCompactEmbeddingLabel(embeddingSpaceId: string | null | undefined) {
  const option = getEmbeddingSpaceOption(embeddingSpaceId);
  const providerLabel = option
    ? (EMBEDDING_PROVIDER_BADGES[option.provider] ?? option.provider)
    : "Model";
  const rawModel =
    option?.model ?? option?.embeddingModelId ?? embeddingSpaceId ?? "Unknown";
  const compactModel = rawModel.replace(/^text-embedding-/, "") || rawModel;
  const versionSuffix = option?.version ? ` (${option.version})` : "";
  const displayLabel =
    `${providerLabel} ${compactModel}${versionSuffix}`.trim();
  const fullLabel = option?.label ?? embeddingSpaceId ?? "Unknown model";
  return {
    displayLabel: displayLabel || "Unknown model",
    fullLabel,
  };
}

export type RecentRunsTableProps = {
  runs: RunRecord[];
  isLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasFiltersApplied: boolean;
  activeFilterCount: number;
  expandedRunIds: Set<string>;
  deletingRunIds: Record<string, boolean>;
  resolvePageUrl: (run: RunRecord) => string | null;
  onToggleRunDetails: (runId: string) => void;
  onDeleteRun: (run: RunRecord) => void;
  onPageChange: (nextPage: number) => void;
  onResetFilters: () => void;
};

export function RecentRunsTable({
  runs,
  isLoading,
  error,
  page,
  pageSize,
  totalCount,
  totalPages,
  hasFiltersApplied,
  activeFilterCount,
  expandedRunIds,
  deletingRunIds,
  resolvePageUrl,
  onToggleRunDetails,
  onDeleteRun,
  onPageChange,
  onResetFilters,
}: RecentRunsTableProps): JSX.Element {
  const totalPagesSafe = Math.max(totalPages, 1);
  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);
  const summaryText =
    totalCount === 0
      ? "No runs to display yet."
      : `Showing ${numberFormatter.format(startIndex)}-${numberFormatter.format(endIndex)} of ${numberFormatter.format(totalCount)} run${totalCount === 1 ? "" : "s"}.`;

  const columns = useMemo<DataTableColumn<RunRecord>[]>(() => {
    return [
      {
        header: "Started",
        render: (run) => <ClientSideDate value={run.started_at} />,
        variant: "muted",
        size: "xs",
        className: recentStyles.startedColumn,
        width: "130px",
      },
      {
        header: "Outcome",
        render: (run) => {
          const errorCount = run.error_count ?? 0;
          const logs = run.error_logs ?? [];
          const isFullySkipped =
            run.status === "success" &&
            (run.documents_processed ?? 0) > 0 &&
            run.documents_processed === run.documents_skipped &&
            (run.chunks_added ?? 0) === 0 &&
            (run.chunks_updated ?? 0) === 0;
          const displayStatus = isFullySkipped ? "skipped" : run.status;
          const displayStatusLabel = isFullySkipped
            ? "No changes"
            : run.status.replaceAll("_", " ");
          const statusVariant =
            runStatusVariantMap[
              (displayStatus ?? "unknown") as RunStatus | "unknown"
            ];
          const typeVariant =
            run.ingestion_type === "full" ? "info" : "warning";
          const typeLabel = run.ingestion_type === "full" ? "Full" : "Partial";

          return (
            <div className={recentStyles.outcomeCell}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  variant={statusVariant}
                  className={
                    displayStatus === "completed_with_errors"
                      ? "ai-status-pill--block"
                      : undefined
                  }
                >
                  {displayStatusLabel}
                </StatusPill>
                <StatusPill variant={typeVariant}>{typeLabel}</StatusPill>
                <ErrorLogSummary
                  errorCount={errorCount}
                  logs={logs}
                  runId={run.id}
                />
              </div>
            </div>
          );
        },
        variant: "primary",
        size: "sm",
        className: recentStyles.outcomeColumn,
        width: "180px",
      },
      {
        header: "Embedding",
        render: (run) => {
          const embeddingSpaceId = getEmbeddingSpaceIdFromMetadata(
            run.metadata,
          );
          const { displayLabel, fullLabel } =
            getCompactEmbeddingLabel(embeddingSpaceId);
          return (
            <span
              className={cn(
                recentStyles.embeddingColumn,
                recentStyles.cellTruncate,
              )}
              title={fullLabel}
            >
              {displayLabel}
            </span>
          );
        },
        variant: "primary",
        size: "xs",
        className: cn(recentStyles.embeddingColumn, recentStyles.cellTruncate),
        width: "160px",
      },
      {
        header: "Duration",
        render: (run) => formatDuration(run.duration_ms ?? 0),
        align: "right",
        variant: "numeric",
        size: "xs",
        className: recentStyles.numericColumn,
        width: "90px",
      },
      {
        header: "Chunks (+ / ~)",
        render: (run) => {
          const added = run.chunks_added ?? 0;
          const updated = run.chunks_updated ?? 0;
          const title = `Chunks — Added: ${numberFormatter.format(
            added,
          )}, Updated: ${numberFormatter.format(updated)}`;
          const placeholderSlot = " · —";
          return (
            <span
              className={cn(
                recentStyles.numericColumn,
                recentStyles.cellCompact,
                recentStyles.metricSummary,
                recentStyles.chunksCell,
              )}
              title={title}
            >
              {`+${numberFormatter.format(added)} · ~${numberFormatter.format(
                updated,
              )}${placeholderSlot}`}
            </span>
          );
        },
        align: "right",
        variant: "muted",
        size: "xs",
        className: cn(recentStyles.numericColumn, recentStyles.chunksCell),
        width: "140px",
      },
      {
        header: "Docs (+ / ~ / −)",
        render: (run) => {
          const added = run.documents_added ?? 0;
          const updated = run.documents_updated ?? 0;
          const skipped = run.documents_skipped ?? 0;
          const skipPart =
            skipped > 0 ? ` −${numberFormatter.format(skipped)}` : "";
          const title = `Docs — Added: ${numberFormatter.format(
            added,
          )}, Updated: ${numberFormatter.format(updated)}${
            skipped > 0 ? `, Skipped: ${numberFormatter.format(skipped)}` : ""
          }`;
          return (
            <span
              className={cn(
                recentStyles.numericColumn,
                recentStyles.cellCompact,
                recentStyles.metricSummary,
                recentStyles.docsCell,
              )}
              title={title}
            >
              {`+${numberFormatter.format(added)} · ~${numberFormatter.format(
                updated,
              )}${skipPart ? ` ·${skipPart}` : " · —"}`}
            </span>
          );
        },
        align: "right",
        variant: "muted",
        size: "xs",
        className: cn(recentStyles.numericColumn, recentStyles.docsCell),
        width: "140px",
      },
      {
        header: "Data Added",
        render: (run) => {
          const value = run.characters_added ?? 0;
          const detailText = formatCharacters(value);
          const display = value > 0 ? detailText : "—";
          return (
            <span
              className={cn(
                recentStyles.numericColumn,
                recentStyles.numericDataCell,
                recentStyles.cellNums,
              )}
              title={detailText}
            >
              {display}
            </span>
          );
        },
        align: "right",
        variant: "numeric",
        size: "xs",
        className: cn(recentStyles.numericColumn, recentStyles.numericDataCell),
        width: "110px",
      },
      {
        header: "Data Updated",
        render: (run) => {
          const value = run.characters_updated ?? 0;
          const detailText = formatCharacters(value);
          const display = value > 0 ? detailText : "—";
          return (
            <span
              className={cn(
                recentStyles.numericColumn,
                recentStyles.numericDataCell,
                recentStyles.cellNums,
              )}
              title={detailText}
            >
              {display}
            </span>
          );
        },
        align: "right",
        variant: "numeric",
        size: "xs",
        className: cn(recentStyles.numericColumn, recentStyles.numericDataCell),
        width: "110px",
      },
      {
        header: "Actions",
        render: (run) => {
          const isDeleting = deletingRunIds[run.id] === true;
          const pageUrl = resolvePageUrl(run);
          const isExpanded = expandedRunIds.has(run.id);
          return (
            <div className={recentStyles.actionsCell}>
              <div className={recentStyles.actionsPrimary}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeleteRun(run)}
                  disabled={isDeleting}
                  className={recentStyles.deleteButton}
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </Button>
                {pageUrl ? (
                  <a
                    href={pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={pageUrl}
                    aria-label="Open page in a new tab"
                    className={cn(
                      "ai-button ai-button-ghost ai-button-size-sm focus-ring flex-nowrap",
                      recentStyles.pageAction,
                    )}
                  >
                    <FiExternalLink aria-hidden="true" className="h-4 w-4" />
                    <span>Page</span>
                  </a>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onToggleRunDetails(run.id)}
                aria-expanded={isExpanded}
                aria-label={
                  isExpanded ? "Hide run details" : "Show run details"
                }
                className={recentStyles.detailToggle}
              >
                <FiChevronDown
                  aria-hidden="true"
                  className={cn(
                    "h-4 w-4 transition-transform duration-150",
                    isExpanded && "rotate-180",
                  )}
                />
              </Button>
            </div>
          );
        },
        align: "right",
        variant: "muted",
        size: "sm",
        className: cn(recentStyles.actionsColumn, recentStyles.actionsStable),
        width: "220px",
      },
    ];
  }, [
    deletingRunIds,
    onDeleteRun,
    expandedRunIds,
    resolvePageUrl,
    onToggleRunDetails,
  ]);

  const renderRunDetails = useCallback(
    (run: RunRecord) => {
      if (!expandedRunIds.has(run.id)) {
        return null;
      }
      return <RunDetailRow run={run} pageUrl={resolvePageUrl(run)} />;
    },
    [expandedRunIds, resolvePageUrl],
  );

  return (
    <div className={recentStyles.tableShell}>
      <div className={recentStyles.tableXScroll}>
        <div className={recentStyles.tableYScroll}>
          <DataTable
            columns={columns}
            data={runs}
            className={recentStyles.dataTable}
            emptyMessage={
              <div className={recentStyles.emptyState}>
                <span className={recentStyles.emptyStateIcon}>
                  <FiLayers aria-hidden="true" />
                </span>
                <p className="font-semibold">No runs match your filters.</p>
                {hasFiltersApplied ? (
                  <button
                    type="button"
                    className="ai-button ai-button-ghost ai-button-size-sm"
                    onClick={onResetFilters}
                  >
                    Clear filters ({activeFilterCount})
                  </button>
                ) : (
                  <p className="ai-meta-text">
                    No ingestion runs recorded yet.
                  </p>
                )}
              </div>
            }
            errorMessage={error}
            isLoading={isLoading}
            rowKey={(run) => run.id}
            stickyHeader
            headerClassName={recentStyles.tableHeaderRow}
            rowClassName="ai-selectable ai-selectable--hoverable"
            renderRowDetails={renderRunDetails}
            rowDetailsClassName={recentStyles.detailsRow}
            rowDetailsCellClassName={recentStyles.detailsCell}
          />
        </div>
      </div>
      <div className={recentStyles.tableFooter}>
        <div>
          <span className="ai-meta-text">{summaryText}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(page - 1, 1))}
            disabled={page <= 1 || isLoading}
          >
            Previous
          </Button>
          <span className="ai-meta-text whitespace-nowrap">
            Page {page.toLocaleString()} of {totalPagesSafe.toLocaleString()}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(page + 1, totalPagesSafe))}
            disabled={page >= totalPagesSafe || isLoading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
