import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { useRouter } from "next/router";
import {
  type ChangeEvent,
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  RecentRunsSnapshot,
  RunsApiResponse,
} from "@/lib/admin/ingestion-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorLogSummary } from "@/components/ui/error-log-summary";
import { RecentRunsFilters } from "@/components/ui/recent-runs-filters";
import { StatusPill } from "@/components/ui/status-pill";
import {
  formatCharacters,
  formatDate,
  formatDuration,
  numberFormatter,
  runStatusVariantMap,
} from "@/lib/admin/ingestion-formatters";
import {
  collectEmbeddingModels,
  collectSources,
  getEmbeddingSpaceIdFromMetadata,
  getNumericMetadata,
  getStringMetadata,
  mergeEmbeddingModels,
  mergeSources,
} from "@/lib/admin/ingestion-metadata";
import {
  parseBooleanQueryValue,
  parseDateQueryValue,
  parseEmbeddingModelQueryValue,
  parseIngestionTypeQueryValue,
  parsePageQueryValue,
  parseSourceQueryValue,
  parseStatusQueryValue,
} from "@/lib/admin/ingestion-query";
import {
  INGESTION_TYPE_VALUES,
  type IngestionType,
  RUN_STATUS_VALUES,
  type RunRecord,
  type RunStatus,
} from "@/lib/admin/ingestion-runs";
import {
  ALL_FILTER_VALUE,
  formatEmbeddingSpaceLabel,
  getEmbeddingSpaceOption,
} from "@/lib/admin/recent-runs-filters";

import { ClientSideDate } from "./client-side-date";

export function RecentRunsSection({
  initial,
}: {
  initial: RecentRunsSnapshot;
}): JSX.Element {
  const router = useRouter();
  const [runs, setRuns] = useState<RunRecord[]>(initial.runs);
  const [page, setPage] = useState<number>(initial.page);
  const [pageSize] = useState<number>(initial.pageSize);
  const [totalCount, setTotalCount] = useState<number>(initial.totalCount);
  const [totalPages, setTotalPages] = useState<number>(initial.totalPages);
  const [statusFilter, setStatusFilter] = useState<
    RunStatus | typeof ALL_FILTER_VALUE
  >(ALL_FILTER_VALUE);
  const [ingestionTypeFilter, setIngestionTypeFilter] = useState<
    IngestionType | typeof ALL_FILTER_VALUE
  >(ALL_FILTER_VALUE);
  const [sourceFilter, setSourceFilter] = useState<
    string | typeof ALL_FILTER_VALUE
  >(ALL_FILTER_VALUE);
  const [embeddingProviderFilter, setEmbeddingProviderFilter] = useState<
    string | typeof ALL_FILTER_VALUE
  >(ALL_FILTER_VALUE);
  const [hideSkipped, setHideSkipped] = useState<boolean>(false);
  const [startedFromFilter, setStartedFromFilter] = useState<string>("");
  const [startedToFilter, setStartedToFilter] = useState<string>("");
  const [statusOptions, setStatusOptions] = useState<RunStatus[]>(() => [
    ...RUN_STATUS_VALUES,
  ]);
  const [ingestionTypeOptions, setIngestionTypeOptions] = useState<
    IngestionType[]
  >(() => [...INGESTION_TYPE_VALUES]);
  const [knownSources, setKnownSources] = useState<string[]>(() =>
    collectSources(initial.runs),
  );
  const [knownEmbeddingProviders, setKnownEmbeddingProviders] = useState<
    string[]
  >(() => collectEmbeddingModels(initial.runs));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingRunIds, setDeletingRunIds] = useState<Record<string, boolean>>(
    {},
  );
  const firstLoadRef = useRef(true);

  const hasFiltersApplied =
    statusFilter !== ALL_FILTER_VALUE ||
    ingestionTypeFilter !== ALL_FILTER_VALUE ||
    sourceFilter !== ALL_FILTER_VALUE ||
    embeddingProviderFilter !== ALL_FILTER_VALUE ||
    startedFromFilter !== "" ||
    startedToFilter !== "" ||
    hideSkipped;

  const sourceOptions = useMemo(() => {
    if (sourceFilter === ALL_FILTER_VALUE) {
      return knownSources;
    }
    if (knownSources.includes(sourceFilter)) {
      return knownSources;
    }
    return [...knownSources, sourceFilter].toSorted((a, b) =>
      a.localeCompare(b),
    );
  }, [knownSources, sourceFilter]);

  const embeddingProviderOptions = useMemo(() => {
    if (embeddingProviderFilter === ALL_FILTER_VALUE) {
      return knownEmbeddingProviders;
    }
    if (knownEmbeddingProviders.includes(embeddingProviderFilter)) {
      return knownEmbeddingProviders;
    }
    return [...knownEmbeddingProviders, embeddingProviderFilter].toSorted(
      (a, b) => a.localeCompare(b),
    );
  }, [knownEmbeddingProviders, embeddingProviderFilter]);

  const updateQuery = useCallback(
    (next: {
      page: number;
      status: RunStatus | typeof ALL_FILTER_VALUE;
      ingestionType: IngestionType | typeof ALL_FILTER_VALUE;
      source: string | typeof ALL_FILTER_VALUE;
      embeddingModel: string | typeof ALL_FILTER_VALUE;
      startedFrom: string;
      startedTo: string;
      hideSkipped: boolean;
    }) => {
      if (!router.isReady) {
        return;
      }

      const preserved: Record<string, string> = {};
      for (const [key, value] of Object.entries(router.query)) {
        if (
          key === "page" ||
          key === "status" ||
          key === "ingestionType" ||
          key === "source" ||
          key === "startedFrom" ||
          key === "startedTo" ||
          key === "hideSkipped"
        ) {
          continue;
        }
        const first = Array.isArray(value) ? value[0] : value;
        if (typeof first === "string") {
          preserved[key] = first;
        }
      }

      if (next.page > 1) {
        preserved.page = String(next.page);
      }
      if (next.status !== ALL_FILTER_VALUE) {
        preserved.status = next.status;
      }
      if (next.ingestionType !== ALL_FILTER_VALUE) {
        preserved.ingestionType = next.ingestionType;
      }
      if (next.source !== ALL_FILTER_VALUE && next.source.trim().length > 0) {
        preserved.source = next.source.trim();
      }
      if (next.embeddingModel !== ALL_FILTER_VALUE) {
        preserved.embeddingModel = next.embeddingModel;
      }
      if (next.startedFrom) {
        preserved.startedFrom = next.startedFrom;
      }
      if (next.startedTo) {
        preserved.startedTo = next.startedTo;
      }
      if (next.hideSkipped) {
        preserved.hideSkipped = "true";
      }

      void router.replace(
        { pathname: router.pathname, query: preserved },
        undefined,
        { shallow: true, scroll: false },
      );
    },
    [router],
  );

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const nextStatus = parseStatusQueryValue(router.query.status);
    const nextIngestionType = parseIngestionTypeQueryValue(
      router.query.ingestionType,
    );
    const nextSource = parseSourceQueryValue(router.query.source);
    let nextEmbeddingProvider = parseEmbeddingModelQueryValue(
      router.query.embeddingModel,
    );
    if (nextEmbeddingProvider === ALL_FILTER_VALUE) {
      const legacy = parseEmbeddingModelQueryValue(
        router.query.embeddingProvider,
      );
      if (legacy !== ALL_FILTER_VALUE) {
        const legacyOption = getEmbeddingSpaceOption(legacy);
        nextEmbeddingProvider = legacyOption
          ? legacyOption.embeddingSpaceId
          : legacy;
      }
    }
    const nextPage = parsePageQueryValue(router.query.page);
    const nextStartedFrom = parseDateQueryValue(router.query.startedFrom);
    const nextStartedTo = parseDateQueryValue(router.query.startedTo);
    const nextHideSkipped = parseBooleanQueryValue(
      router.query.hideSkipped,
      false,
    );

    setStatusFilter((prev) => (prev === nextStatus ? prev : nextStatus));
    setIngestionTypeFilter((prev) =>
      prev === nextIngestionType ? prev : nextIngestionType,
    );
    setSourceFilter((prev) => (prev === nextSource ? prev : nextSource));
    setEmbeddingProviderFilter((prev) =>
      prev === nextEmbeddingProvider ? prev : nextEmbeddingProvider,
    );
    setPage((prev) => (prev === nextPage ? prev : nextPage));
    setStartedFromFilter((prev) =>
      prev === nextStartedFrom ? prev : nextStartedFrom,
    );
    setStartedToFilter((prev) =>
      prev === nextStartedTo ? prev : nextStartedTo,
    );
    setHideSkipped((prev) =>
      prev === nextHideSkipped ? prev : nextHideSkipped,
    );
  }, [router.isReady, router.query]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const isDefaultState =
      page === initial.page &&
      statusFilter === ALL_FILTER_VALUE &&
      ingestionTypeFilter === ALL_FILTER_VALUE &&
      sourceFilter === ALL_FILTER_VALUE &&
      embeddingProviderFilter === ALL_FILTER_VALUE &&
      startedFromFilter === "" &&
      startedToFilter === "" &&
      !hideSkipped;

    if (firstLoadRef.current && isDefaultState) {
      firstLoadRef.current = false;
      return;
    }

    firstLoadRef.current = false;

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (statusFilter !== ALL_FILTER_VALUE) {
      params.append("status", statusFilter);
    }
    if (ingestionTypeFilter !== ALL_FILTER_VALUE) {
      params.append("ingestionType", ingestionTypeFilter);
    }
    if (sourceFilter !== ALL_FILTER_VALUE && sourceFilter.trim().length > 0) {
      params.append("source", sourceFilter.trim());
    }
    if (embeddingProviderFilter !== ALL_FILTER_VALUE) {
      params.append("embeddingModel", embeddingProviderFilter);
    }
    if (startedFromFilter) {
      params.set("startedFrom", startedFromFilter);
    }
    if (startedToFilter) {
      params.set("startedTo", startedToFilter);
    }
    if (hideSkipped) {
      params.set("hideSkipped", "true");
    }

    const controller = new AbortController();
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchRuns = async () => {
      try {
        const response = await fetch(
          `/api/admin/ingestion-runs?${params.toString()}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to fetch runs.");
        }
        const payload = (await response.json()) as RunsApiResponse;
        if (cancelled) {
          return;
        }
        if (payload.totalPages > 0 && page > payload.totalPages) {
          const nextPage = Math.max(1, payload.totalPages);
          setPage(nextPage);
          updateQuery({
            page: nextPage,
            status: statusFilter,
            ingestionType: ingestionTypeFilter,
            source: sourceFilter,
            embeddingModel: embeddingProviderFilter,
            startedFrom: startedFromFilter,
            startedTo: startedToFilter,
            hideSkipped,
          });
          return;
        }
        setRuns(payload.runs);
        setTotalCount(payload.totalCount);
        setTotalPages(payload.totalPages);
        setStatusOptions(payload.statusOptions);
        setIngestionTypeOptions(payload.ingestionTypeOptions);
        setKnownSources((current) => mergeSources(current, payload.runs));
        setKnownEmbeddingProviders((current) =>
          mergeEmbeddingModels(current, payload.runs),
        );
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected error fetching runs.";
        setError(message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchRuns();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    router.isReady,
    page,
    pageSize,
    statusFilter,
    ingestionTypeFilter,
    sourceFilter,
    startedFromFilter,
    startedToFilter,
    hideSkipped,
    embeddingProviderFilter,
    initial.page,
    updateQuery,
  ]);

  const handleStatusChange = useCallback(
    (nextStatus: RunStatus | typeof ALL_FILTER_VALUE) => {
      setStatusFilter(nextStatus);
      const nextPage = 1;
      if (page !== nextPage) {
        setPage(nextPage);
      }
      updateQuery({
        page: nextPage,
        status: nextStatus,
        ingestionType: ingestionTypeFilter,
        source: sourceFilter,
        embeddingModel: embeddingProviderFilter,
        startedFrom: startedFromFilter,
        startedTo: startedToFilter,
        hideSkipped,
      });
    },
    [
      ingestionTypeFilter,
      page,
      sourceFilter,
      startedFromFilter,
      startedToFilter,
      updateQuery,
      hideSkipped,
      embeddingProviderFilter,
    ],
  );

  const handleIngestionTypeChange = useCallback(
    (nextType: IngestionType | typeof ALL_FILTER_VALUE) => {
      setIngestionTypeFilter(nextType);
      const nextPage = 1;
      if (page !== nextPage) {
        setPage(nextPage);
      }
      updateQuery({
        page: nextPage,
        status: statusFilter,
        ingestionType: nextType,
        source: sourceFilter,
        embeddingModel: embeddingProviderFilter,
        startedFrom: startedFromFilter,
        startedTo: startedToFilter,
        hideSkipped,
      });
    },
    [
      page,
      sourceFilter,
      startedFromFilter,
      startedToFilter,
      statusFilter,
      updateQuery,
      hideSkipped,
      embeddingProviderFilter,
    ],
  );

  const handleSourceChange = useCallback(
    (nextSource: string | typeof ALL_FILTER_VALUE) => {
      setSourceFilter(nextSource);
      const nextPage = 1;
      if (page !== nextPage) {
        setPage(nextPage);
      }
      updateQuery({
        page: nextPage,
        status: statusFilter,
        ingestionType: ingestionTypeFilter,
        source: nextSource,
        embeddingModel: embeddingProviderFilter,
        startedFrom: startedFromFilter,
        startedTo: startedToFilter,
        hideSkipped,
      });
    },
    [
      ingestionTypeFilter,
      page,
      startedFromFilter,
      startedToFilter,
      statusFilter,
      updateQuery,
      hideSkipped,
      embeddingProviderFilter,
    ],
  );

  const handleEmbeddingProviderChange = useCallback(
    (resolved: string | typeof ALL_FILTER_VALUE) => {
      setEmbeddingProviderFilter(resolved);
      const nextPage = 1;
      if (page !== nextPage) {
        setPage(nextPage);
      }
      updateQuery({
        page: nextPage,
        status: statusFilter,
        ingestionType: ingestionTypeFilter,
        source: sourceFilter,
        embeddingModel: resolved,
        startedFrom: startedFromFilter,
        startedTo: startedToFilter,
        hideSkipped,
      });
    },
    [
      ingestionTypeFilter,
      page,
      sourceFilter,
      startedFromFilter,
      startedToFilter,
      statusFilter,
      updateQuery,
      hideSkipped,
    ],
  );

  const handleStartedFromChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setStartedFromFilter(value);
      const nextPage = 1;
      if (page !== nextPage) {
        setPage(nextPage);
      }
      updateQuery({
        page: nextPage,
        status: statusFilter,
        ingestionType: ingestionTypeFilter,
        source: sourceFilter,
        embeddingModel: embeddingProviderFilter,
        startedFrom: value,
        startedTo: startedToFilter,
        hideSkipped,
      });
    },
    [
      ingestionTypeFilter,
      page,
      sourceFilter,
      startedToFilter,
      statusFilter,
      updateQuery,
      hideSkipped,
      embeddingProviderFilter,
    ],
  );

  const handleStartedToChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setStartedToFilter(value);
      const nextPage = 1;
      if (page !== nextPage) {
        setPage(nextPage);
      }
      updateQuery({
        page: nextPage,
        status: statusFilter,
        ingestionType: ingestionTypeFilter,
        source: sourceFilter,
        embeddingModel: embeddingProviderFilter,
        startedFrom: startedFromFilter,
        startedTo: value,
        hideSkipped,
      });
    },
    [
      ingestionTypeFilter,
      page,
      sourceFilter,
      startedFromFilter,
      statusFilter,
      updateQuery,
      hideSkipped,
      embeddingProviderFilter,
    ],
  );

  const handleHideSkippedChange = useCallback(
    (nextHideSkipped: boolean) => {
      setHideSkipped(nextHideSkipped);
      updateQuery({
        page,
        status: statusFilter,
        ingestionType: ingestionTypeFilter,
        source: sourceFilter,
        embeddingModel: embeddingProviderFilter,
        startedFrom: startedFromFilter,
        startedTo: startedToFilter,
        hideSkipped: nextHideSkipped,
      });
    },
    [
      page,
      statusFilter,
      ingestionTypeFilter,
      sourceFilter,
      startedFromFilter,
      startedToFilter,
      updateQuery,
      embeddingProviderFilter,
    ],
  );

  const handleResetFilters = useCallback(() => {
    const filtersActive =
      statusFilter !== ALL_FILTER_VALUE ||
      ingestionTypeFilter !== ALL_FILTER_VALUE ||
      sourceFilter !== ALL_FILTER_VALUE ||
      embeddingProviderFilter !== ALL_FILTER_VALUE ||
      startedFromFilter !== "" ||
      startedToFilter !== "" ||
      hideSkipped;

    if (!filtersActive && page === 1) {
      return;
    }

    setStatusFilter(ALL_FILTER_VALUE);
    setIngestionTypeFilter(ALL_FILTER_VALUE);
    setSourceFilter(ALL_FILTER_VALUE);
    setEmbeddingProviderFilter(ALL_FILTER_VALUE);
    setStartedFromFilter("");
    setStartedToFilter("");
    setHideSkipped(false);
    if (page !== 1) {
      setPage(1);
    }
    updateQuery({
      page: 1,
      status: ALL_FILTER_VALUE,
      ingestionType: ALL_FILTER_VALUE,
      source: ALL_FILTER_VALUE,
      embeddingModel: ALL_FILTER_VALUE,
      startedFrom: "",
      startedTo: "",
      hideSkipped: false,
    });
  }, [
    ingestionTypeFilter,
    page,
    sourceFilter,
    embeddingProviderFilter,
    startedFromFilter,
    startedToFilter,
    statusFilter,
    hideSkipped,
    updateQuery,
  ]);

  const handleDeleteRun = useCallback(
    async (run: RunRecord) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          `Delete run ${run.id} from ${formatDate(run.started_at)}? This action cannot be undone.`,
        )
      ) {
        return;
      }

      setDeletingRunIds((current) => ({ ...current, [run.id]: true }));
      setError(null);

      try {
        const response = await fetch(`/api/admin/ingestion-runs/${run.id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          let message = "Failed to delete run.";
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            try {
              const payload = (await response.json()) as { error?: string };
              if (payload?.error) {
                message = payload.error;
              }
            } catch {
              // Ignore JSON parsing failures.
            }
          } else {
            try {
              const text = await response.text();
              if (text.trim().length > 0) {
                message = text;
              }
            } catch {
              // Ignore text parsing failures.
            }
          }
          throw new Error(message);
        }

        setRuns((currentRuns) =>
          currentRuns.filter((entry: RunRecord) => entry.id !== run.id),
        );

        setTotalCount((currentCount) => {
          const nextCount = Math.max(0, currentCount - 1);
          const computedPages =
            nextCount === 0 ? 1 : Math.max(1, Math.ceil(nextCount / pageSize));
          setTotalPages(computedPages);
          setPage((currentPage) => Math.min(currentPage, computedPages));
          return nextCount;
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unexpected error deleting run.";
        setError(message);
      } finally {
        setDeletingRunIds((current) => {
          const next = { ...current };
          delete next[run.id];
          return next;
        });
      }
    },
    [pageSize],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      const maxPages = Math.max(totalPages, 1);
      const clamped = Math.max(1, Math.min(nextPage, maxPages));
      if (clamped === page) {
        return;
      }
      setPage(clamped);
      updateQuery({
        page: clamped,
        status: statusFilter,
        ingestionType: ingestionTypeFilter,
        source: sourceFilter,
        embeddingModel: embeddingProviderFilter,
        startedFrom: startedFromFilter,
        startedTo: startedToFilter,
        hideSkipped,
      });
    },
    [
      ingestionTypeFilter,
      page,
      sourceFilter,
      embeddingProviderFilter,
      startedFromFilter,
      startedToFilter,
      statusFilter,
      totalPages,
      hideSkipped,
      updateQuery,
    ],
  );

  const handlePreviousPage = useCallback(() => {
    handlePageChange(page - 1);
  }, [handlePageChange, page]);

  const handleNextPage = useCallback(() => {
    handlePageChange(page + 1);
  }, [handlePageChange, page]);

  const totalPagesSafe = Math.max(totalPages, 1);
  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);
  const emptyMessage = hasFiltersApplied
    ? "No runs match the selected filters."
    : "No ingestion runs have been recorded yet.";
  const canReset = hasFiltersApplied || page > 1;
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
      },
      {
        header: "Status",
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
            ? "Skipped"
            : run.status.replaceAll("_", " ");
          const statusVariant =
            runStatusVariantMap[
              (displayStatus ?? "unknown") as RunStatus | "unknown"
            ];

          return (
            <div className="flex flex-col gap-2">
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
              <ErrorLogSummary
                errorCount={errorCount}
                logs={logs}
                runId={run.id}
              />
            </div>
          );
        },
      },
      {
        header: "Type",
        render: (run) => (
          <div className="space-y-1">
            <StatusPill
              variant={run.ingestion_type === "full" ? "info" : "warning"}
            >
              {run.ingestion_type === "full" ? "Full" : "Partial"}
            </StatusPill>
          </div>
        ),
      },
      {
        header: "Embedding Model",
        render: (run) => {
          const embeddingSpaceId = getEmbeddingSpaceIdFromMetadata(
            run.metadata,
          );
          const embeddingModelLabel =
            embeddingSpaceId === null
              ? "Unknown"
              : formatEmbeddingSpaceLabel(embeddingSpaceId);
          return embeddingModelLabel;
        },
        variant: "primary",
        size: "xs",
      },
      {
        header: "Duration",
        render: (run) => formatDuration(run.duration_ms ?? 0),
        align: "right",
        variant: "numeric",
        size: "xs",
      },
      {
        header: "Chunks",
        render: (run) => (
          <div className="space-y-1 text-xs text-[color:var(--ai-text-muted)] whitespace-nowrap">
            <div>Added: {numberFormatter.format(run.chunks_added ?? 0)}</div>
            <div>
              Updated: {numberFormatter.format(run.chunks_updated ?? 0)}
            </div>
          </div>
        ),
        align: "right",
        variant: "muted",
        size: "xs",
      },
      {
        header: "Docs",
        render: (run) => (
          <div className="space-y-1 text-xs text-[color:var(--ai-text-muted)] whitespace-nowrap">
            <div>Added: {numberFormatter.format(run.documents_added ?? 0)}</div>
            <div>
              Updated: {numberFormatter.format(run.documents_updated ?? 0)}
            </div>
            <div>
              Skipped: {numberFormatter.format(run.documents_skipped ?? 0)}
            </div>
          </div>
        ),
        align: "right",
        variant: "muted",
        size: "xs",
      },
      {
        header: "Data Added",
        render: (run) => formatCharacters(run.characters_added ?? 0),
        align: "right",
        variant: "numeric",
        size: "xs",
      },
      {
        header: "Data Updated",
        render: (run) => formatCharacters(run.characters_updated ?? 0),
        align: "right",
        variant: "numeric",
        size: "xs",
      },
      {
        header: "Notes",
        render: (run) => {
          const rootPageId = getStringMetadata(run.metadata, "rootPageId");
          const pageUrl =
            getStringMetadata(run.metadata, "publicPageUrl") ??
            getStringMetadata(run.metadata, "pageUrl");
          const pageId = getStringMetadata(run.metadata, "pageId");
          const targetUrl = getStringMetadata(run.metadata, "url");
          const hostname = getStringMetadata(run.metadata, "hostname");
          const urlCount = getNumericMetadata(run.metadata, "urlCount");
          const finishedAt = run.ended_at;
          const entries: Array<{ label: string; value: JSX.Element | string }> =
            [];
          if (rootPageId) {
            entries.push({ label: "Root", value: rootPageId });
          }
          if (pageId) {
            entries.push({ label: "Page ID", value: pageId });
          }
          if (pageUrl) {
            entries.push({
              label: "Page",
              value: (
                <a
                  className="text-[color:var(--ai-accent-strong)] underline"
                  href={pageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {pageUrl}
                </a>
              ),
            });
          }
          if (targetUrl) {
            entries.push({
              label: "URL",
              value: (
                <a
                  className="text-[color:var(--ai-accent-strong)] underline"
                  href={targetUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {targetUrl}
                </a>
              ),
            });
          }
          if (hostname) {
            entries.push({ label: "Host", value: hostname });
          }
          if (urlCount !== null) {
            entries.push({
              label: "URLs",
              value: numberFormatter.format(urlCount),
            });
          }
          if (finishedAt) {
            entries.push({
              label: "Finished",
              value: <ClientSideDate value={finishedAt} />,
            });
          }
          if (entries.length === 0) {
            return <span className="ai-meta-text">—</span>;
          }
          return (
            <div className="space-y-1 text-xs text-[color:var(--ai-text-muted)]">
              {entries.map((entry, index) => (
                <div key={`${entry.label}-${index}`}>
                  <span className="font-semibold text-[color:var(--ai-text-strong)]">
                    {entry.label}:
                  </span>{" "}
                  {entry.value}
                </div>
              ))}
            </div>
          );
        },
        size: "xs",
      },
      {
        header: "Actions",
        render: (run) => {
          const isDeleting = deletingRunIds[run.id] === true;
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void handleDeleteRun(run);
              }}
              disabled={isDeleting}
              className="text-[color:var(--ai-error)] border-[color:var(--ai-error)] hover:bg-[color:var(--ai-error-muted)]"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          );
        },
        align: "center",
      },
    ];
  }, [deletingRunIds, handleDeleteRun]);

  return (
    <section className="ai-card space-y-4 p-6">
      <CardHeader>
        <CardTitle icon={<FiLayers aria-hidden="true" />}>
          Recent Runs
        </CardTitle>
        <p className="ai-card-description">
          Latest ingestion activity from manual and scheduled jobs.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <RecentRunsFilters
          statusFilter={statusFilter}
          ingestionTypeFilter={ingestionTypeFilter}
          sourceFilter={sourceFilter}
          embeddingProviderFilter={embeddingProviderFilter}
          startedFromFilter={startedFromFilter}
          startedToFilter={startedToFilter}
          hideSkipped={hideSkipped}
          isLoading={isLoading}
          canReset={canReset}
          statusOptions={statusOptions}
          ingestionTypeOptions={ingestionTypeOptions}
          sourceOptions={sourceOptions}
          embeddingProviderOptions={embeddingProviderOptions}
          onStatusChange={handleStatusChange}
          onIngestionTypeChange={handleIngestionTypeChange}
          onSourceChange={handleSourceChange}
          onEmbeddingProviderChange={handleEmbeddingProviderChange}
          onStartedFromChange={handleStartedFromChange}
          onStartedToChange={handleStartedToChange}
          onHideSkippedChange={handleHideSkippedChange}
          onResetFilters={handleResetFilters}
        />
        <div className="space-y-4">
          <DataTable
            columns={columns}
            data={runs}
            emptyMessage={emptyMessage}
            errorMessage={error}
            isLoading={isLoading}
            rowKey={(run) => run.id}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--ai-border-soft)] px-4 py-3">
            <div>
              <span className="ai-meta-text">{summaryText}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={page <= 1 || isLoading || totalCount === 0}
              >
                Previous
              </Button>
              <span className="ai-meta-text whitespace-nowrap">
                Page {numberFormatter.format(page)} of {" "}
                {numberFormatter.format(totalPagesSafe)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={
                  page >= totalPagesSafe ||
                  runs.length === 0 ||
                  isLoading ||
                  totalCount === 0
                }
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </section>
  );
}
