import { FiChevronDown } from "@react-icons/all-files/fi/FiChevronDown";
import { FiExternalLink } from "@react-icons/all-files/fi/FiExternalLink";
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
import type { ModelProvider } from "@/lib/shared/model-provider";
import { RecentRunsFilters } from "@/components/admin/ingestion/recent-runs-filters";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientSideDate } from "@/components/ui/client-side-date";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorLogSummary } from "@/components/ui/error-log-summary";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/components/ui/utils";
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
  getEmbeddingSpaceOption,
} from "@/lib/admin/recent-runs-filters";

import recentStyles from "./RecentRunsPanel.module.css";

const EMBEDDING_PROVIDER_BADGES: Record<ModelProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  ollama: "Ollama",
  lmstudio: "LM Studio",
};

type DetailStatLine = {
  label: string;
  value: number | null | undefined;
  format?: (value: number) => string;
};

function renderDetailStatField(
  label: string,
  stats: DetailStatLine[],
) {
  return (
    <div className={recentStyles.detailField} key={label}>
      <span className={recentStyles.detailsLabel}>{label}</span>
      <div className={recentStyles.detailStatsList}>
        {stats.map((stat) => (
          <div
            key={`${label}-${stat.label}`}
            className={recentStyles.detailStatLine}
          >
            <span className={recentStyles.detailStatLabelInline}>
              {stat.label}
            </span>
            <span className={recentStyles.detailStatValueInline}>
              {stat.format
                ? stat.format(stat.value ?? 0)
                : numberFormatter.format(stat.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getCompactEmbeddingLabel(
  embeddingSpaceId: string | null | undefined,
) {
  const option = getEmbeddingSpaceOption(embeddingSpaceId);
  const providerLabel = option
    ? EMBEDDING_PROVIDER_BADGES[option.provider] ?? option.provider
    : "Model";
  const rawModel =
    option?.model ??
    option?.embeddingModelId ??
    embeddingSpaceId ??
    "Unknown";
  const compactModel =
    rawModel.replace(/^text-embedding-/, "") || rawModel;
  const versionSuffix = option?.version ? ` (${option.version})` : "";
  const displayLabel = `${providerLabel} ${compactModel}${versionSuffix}`.trim();
  const fullLabel = option?.label ?? embeddingSpaceId ?? "Unknown model";
  return {
    displayLabel: displayLabel || "Unknown model",
    fullLabel,
  };
}

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
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(
    () => new Set(),
  );

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

  const handleDeleteRunClick = useCallback(
    (run: RunRecord) => {
      void handleDeleteRun(run);
    },
    [handleDeleteRun],
  );

  const toggleRunDetails = useCallback((runId: string) => {
    setExpandedRunIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }, []);

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

  const totalPagesSafe = Math.max(totalPages, 1);
  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);
  const canReset = hasFiltersApplied || page > 1;
  const summaryText =
    totalCount === 0
      ? "No runs to display yet."
      : `Showing ${numberFormatter.format(startIndex)}-${numberFormatter.format(endIndex)} of ${numberFormatter.format(totalCount)} run${totalCount === 1 ? "" : "s"}.`;
  const resolvePageUrl = useCallback((run: RunRecord) => {
    const publicPageUrl = getStringMetadata(run.metadata, "publicPageUrl");
    const pageUrl =
      publicPageUrl ?? getStringMetadata(run.metadata, "pageUrl");
    const fallbackUrl = getStringMetadata(run.metadata, "url");
    return pageUrl ?? fallbackUrl ?? null;
  }, []);
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
            ? "Skipped"
            : run.status.replaceAll("_", " ");
          const statusVariant =
            runStatusVariantMap[
              (displayStatus ?? "unknown") as RunStatus | "unknown"
            ];
          const typeVariant = run.ingestion_type === "full" ? "info" : "warning";
          const typeLabel =
            run.ingestion_type === "full" ? "Full" : "Partial";

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
          const { displayLabel, fullLabel } = getCompactEmbeddingLabel(
            embeddingSpaceId,
          );
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
        className: cn(
          recentStyles.embeddingColumn,
          recentStyles.cellTruncate,
        ),
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
        header: "Chunks",
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
        className: cn(
          recentStyles.numericColumn,
          recentStyles.chunksCell,
        ),
        width: "140px",
      },
      {
        header: "Docs",
        render: (run) => {
          const added = run.documents_added ?? 0;
          const updated = run.documents_updated ?? 0;
          const skipped = run.documents_skipped ?? 0;
          const skipPart =
            skipped > 0
              ? ` −${numberFormatter.format(skipped)}`
              : "";
          const title = `Docs — Added: ${numberFormatter.format(
            added,
          )}, Updated: ${numberFormatter.format(updated)}${
            skipped > 0
              ? `, Skipped: ${numberFormatter.format(skipped)}`
              : ""
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
        className: cn(
          recentStyles.numericColumn,
          recentStyles.docsCell,
        ),
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
        className: cn(
          recentStyles.numericColumn,
          recentStyles.numericDataCell,
        ),
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
        className: cn(
          recentStyles.numericColumn,
          recentStyles.numericDataCell,
        ),
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
                  onClick={() => handleDeleteRunClick(run)}
                  disabled={isDeleting}
                  className="text-[color:var(--ai-error)] border-[color:var(--ai-error)] hover:bg-[color:var(--ai-error-muted)]"
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
                    <FiExternalLink
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                    <span>Page</span>
                  </a>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => toggleRunDetails(run.id)}
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
    handleDeleteRunClick,
    expandedRunIds,
    resolvePageUrl,
    toggleRunDetails,
  ]);

  const renderRunDetails = useCallback(
    (run: RunRecord) => {
      if (!expandedRunIds.has(run.id)) {
        return null;
      }
      const pageUrl = resolvePageUrl(run);
      const pageId = getStringMetadata(run.metadata, "pageId");
      const rootPageId = getStringMetadata(run.metadata, "rootPageId");
      const notes = getStringMetadata(run.metadata, "notes");
      const note = getStringMetadata(run.metadata, "note");
      const issue = getStringMetadata(run.metadata, "issue");
      const finishedAt = run.ended_at;
      const detailSections: JSX.Element[] = [];

      if (pageId) {
        detailSections.push(
          <div className={recentStyles.detailField} key="page-id">
            <span className={recentStyles.detailsLabel}>Page ID</span>
            <span
              className={cn(
                recentStyles.detailsValue,
                recentStyles.detailsValueMono,
              )}
            >
              {pageId}
            </span>
          </div>,
        );
      }

      if (rootPageId) {
        detailSections.push(
          <div className={recentStyles.detailField} key="root-page-id">
            <span className={recentStyles.detailsLabel}>Root page ID</span>
            <span
              className={cn(
                recentStyles.detailsValue,
                recentStyles.detailsValueMono,
              )}
            >
              {rootPageId}
            </span>
          </div>,
        );
      }

      if (pageUrl) {
        detailSections.push(
          <div className={recentStyles.detailField} key="page-link">
            <span className={recentStyles.detailsLabel}>Page link</span>
            <a
              href={pageUrl}
              target="_blank"
              rel="noreferrer"
              title={pageUrl}
              className={recentStyles.detailsLink}
            >
              {pageUrl}
            </a>
          </div>,
        );
      }

      if (finishedAt) {
        detailSections.push(
          <div className={recentStyles.detailField} key="finished">
            <span className={recentStyles.detailsLabel}>Finished</span>
            <span className={recentStyles.detailsValue}>
              <ClientSideDate value={finishedAt} />
            </span>
          </div>,
        );
      }

      const chunkStats: DetailStatLine[] = [
        { label: "Added", value: run.chunks_added ?? 0 },
        { label: "Updated", value: run.chunks_updated ?? 0 },
      ];
      detailSections.push(renderDetailStatField("Chunks", chunkStats));

      const docStats: DetailStatLine[] = [
        { label: "Added", value: run.documents_added ?? 0 },
        { label: "Updated", value: run.documents_updated ?? 0 },
        { label: "Skipped", value: run.documents_skipped ?? 0 },
      ];
      detailSections.push(renderDetailStatField("Documents", docStats));

      const dataStats: DetailStatLine[] = [
        {
          label: "Added",
          value: run.characters_added ?? 0,
          format: formatCharacters,
        },
        {
          label: "Updated",
          value: run.characters_updated ?? 0,
          format: formatCharacters,
        },
      ];
      detailSections.push(renderDetailStatField("Data", dataStats));

      const detailNotes = notes || note || issue ? (
        <div className={recentStyles.detailNotes} key="notes">
          <span className={recentStyles.detailsLabel}>Notes</span>
          <div className={recentStyles.detailNotesContent}>
            {notes && <p>{notes}</p>}
            {note && note !== notes && <p>{note}</p>}
            {issue && (
              <p>
                <span className="font-semibold">Issue:</span> {issue}
              </p>
            )}
          </div>
        </div>
      ) : null;

      return (
        <div className={recentStyles.detailsPanel}>
          {detailSections}
          {detailNotes}
        </div>
      );
    },
    [expandedRunIds, resolvePageUrl],
  );

  return (
    <section className="ai-card space-y-4 p-6">
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
        </div>
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
                    <p className="ai-meta-text">
                      Adjust filters or clear them to see recent runs.
                    </p>
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
            onClick={() => handlePageChange(Math.max(page - 1, 1))}
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
            onClick={() =>
              handlePageChange(Math.min(page + 1, totalPagesSafe))
            }
            disabled={page >= totalPagesSafe || isLoading}
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
