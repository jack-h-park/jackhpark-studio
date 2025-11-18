import type { GetServerSideProps } from "next";
import { FiActivity } from "@react-icons/all-files/fi/FiActivity";
import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiBarChart2 } from "@react-icons/all-files/fi/FiBarChart2";
import { FiClock } from "@react-icons/all-files/fi/FiClock";
import { FiDatabase } from "@react-icons/all-files/fi/FiDatabase";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { FiList } from "@react-icons/all-files/fi/FiList";
import { FiPlayCircle } from "@react-icons/all-files/fi/FiPlayCircle";
import Head from "next/head";
import { useRouter } from "next/router";
import { type ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";
import {
  type ChangeEvent,
  type ComponentType,
  type FormEvent,
  type JSX,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ModelProvider } from "@/lib/shared/model-provider";
import { AiPageChrome } from "@/components/AiPageChrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorLogSummary } from "@/components/ui/error-log-summary";
import { GridPanel } from "@/components/ui/grid-panel";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { ManualLogEntry } from "@/components/ui/manual-log-entry";
import { ProgressGroup } from "@/components/ui/progress-group";
import { ScopeTile } from "@/components/ui/scope-tile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import { TabPill } from "@/components/ui/tab-pill";
import { TabPanel } from "@/components/ui/tabs";
import { TipCallout } from "@/components/ui/tip-callout";
import {
  DEFAULT_EMBEDDING_SPACE_ID,
  type EmbeddingSpace,
  findEmbeddingSpace,
  listEmbeddingModelOptions,
  resolveEmbeddingSpace,
} from "@/lib/core/embedding-spaces";
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";
import {
  loadCanonicalPageLookup,
  resolvePublicPageUrl,
} from "@/lib/server/page-url";

import type { ManualIngestionRequest } from "../../lib/admin/manual-ingestor";
import {
  DEFAULT_RUNS_PAGE_SIZE,
  INGESTION_TYPE_VALUES,
  type IngestionType,
  normalizeRunRecord,
  RUN_STATUS_VALUES,
  type RunRecord,
  type RunStatus,
} from "../../lib/admin/ingestion-runs";
import {
  normalizeSnapshotRecord,
  type SnapshotRecord,
} from "../../lib/admin/rag-snapshot";
import { getSupabaseAdminClient } from "../../lib/supabase-admin";

const EMBEDDING_MODEL_OPTIONS = listEmbeddingModelOptions();
const EMBEDDING_MODEL_OPTION_MAP = new Map<string, EmbeddingSpace>(
  EMBEDDING_MODEL_OPTIONS.map((option) => [option.embeddingSpaceId, option]),
);
const DEFAULT_MANUAL_EMBEDDING_SPACE_ID =
  EMBEDDING_MODEL_OPTION_MAP.get(DEFAULT_EMBEDDING_SPACE_ID)
    ?.embeddingSpaceId ?? DEFAULT_EMBEDDING_SPACE_ID;
const UNKNOWN_EMBEDDING_FILTER_VALUE = "__unknown_embedding__";

type SnapshotSummary = {
  id: string;
  capturedAt: string | null;
  embeddingSpaceId: string;
  embeddingProvider: ModelProvider;
  embeddingLabel: string;
  runId: string | null;
  runStatus: RunStatus | null;
  ingestionMode: string | null;
  schemaVersion: number | null;
  totalDocuments: number;
  totalChunks: number;
  totalCharacters: number;
  deltaDocuments: number | null;
  deltaChunks: number | null;
  deltaCharacters: number | null;
};

type DatasetSnapshotOverview = {
  latest: SnapshotSummary | null;
  history: SnapshotSummary[];
};

type RecentRunsSnapshot = {
  runs: RunRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type SystemHealthOverview = {
  runId: string | null;
  status: RunStatus | "unknown";
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  errorCount: number | null;
  documentsSkipped: number | null;
  queueDepth: number | null;
  retryCount: number | null;
  pendingRuns: number | null;
  lastFailureRunId: string | null;
  lastFailureAt: string | null;
  lastFailureStatus: RunStatus | null;
  snapshotCapturedAt: string | null;
};

type PageProps = {
  datasetSnapshot: DatasetSnapshotOverview;
  systemHealth: SystemHealthOverview;
  recentRuns: RecentRunsSnapshot;
  headerRecordMap: ExtendedRecordMap | null;
  headerBlockId: string;
};

type ManualRunStats = {
  documentsProcessed: number;
  documentsAdded: number;
  documentsUpdated: number;
  documentsSkipped: number;
  chunksAdded: number;
  chunksUpdated: number;
  charactersAdded: number;
  charactersUpdated: number;
  errorCount: number;
};

type ManualIngestionStatus =
  | "idle"
  | "in_progress"
  | "success"
  | "completed_with_errors"
  | "failed";

const manualStatusVariantMap: Record<ManualIngestionStatus, StatusPillVariant> =
  {
    idle: "muted",
    in_progress: "info",
    success: "success",
    completed_with_errors: "warning",
    failed: "error",
  };

const runStatusVariantMap: Record<
  RunStatus | "unknown" | "skipped",
  StatusPillVariant
> = {
  success: "success",
  completed_with_errors: "warning",
  failed: "error",
  in_progress: "info",
  skipped: "muted",
  unknown: "muted",
};

type ManualEvent =
  | { type: "run"; runId: string | null }
  | { type: "log"; message: string; level?: "info" | "warn" | "error" }
  | { type: "progress"; step: string; percent: number }
  | {
      type: "queue";
      current: number;
      total: number;
      pageId: string;
      title?: string | null;
    }
  | {
      type: "complete";
      status: "success" | "completed_with_errors" | "failed";
      message?: string;
      runId: string | null;
      stats: ManualRunStats;
    };

type ManualLogEvent = {
  id: string;
  message: string;
  level: "info" | "warn" | "error";
  timestamp: number;
};

const LOG_ICONS: Record<
  ManualLogEvent["level"],
  ComponentType<{ "aria-hidden"?: boolean }>
> = {
  info: FiInfo,
  warn: FiAlertTriangle,
  error: FiAlertCircle,
};

const manualStatusLabels: Record<ManualIngestionStatus, string> = {
  idle: "Idle",
  in_progress: "In Progress",
  success: "Succeeded",
  completed_with_errors: "Completed with Errors",
  failed: "Failed",
};

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const logTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const ALL_FILTER_VALUE = "all";
const SNAPSHOT_HISTORY_LIMIT = 8;

const STATUS_LABELS: Record<RunStatus, string> = {
  in_progress: "In Progress",
  success: "Success",
  completed_with_errors: "Completed with Errors",
  failed: "Failed",
};

const INGESTION_TYPE_LABELS: Record<IngestionType, string> = {
  full: "Full",
  partial: "Partial",
};

type RunsApiResponse = {
  runs: RunRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  statusOptions: RunStatus[];
  ingestionTypeOptions: IngestionType[];
};

function getStatusLabel(status: RunStatus): string {
  return STATUS_LABELS[status] ?? status;
}

function getIngestionTypeLabel(type: IngestionType): string {
  return INGESTION_TYPE_LABELS[type] ?? type;
}

function extractQueryValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return (
      value.find((entry) => typeof entry === "string" && entry.length > 0) ??
      null
    );
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

function parseStatusQueryValue(
  value: string | string[] | undefined,
): RunStatus | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (extracted && RUN_STATUS_VALUES.includes(extracted as RunStatus)) {
    return extracted as RunStatus;
  }
  return ALL_FILTER_VALUE;
}

function parseIngestionTypeQueryValue(
  value: string | string[] | undefined,
): IngestionType | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (extracted && INGESTION_TYPE_VALUES.includes(extracted as IngestionType)) {
    return extracted as IngestionType;
  }
  return ALL_FILTER_VALUE;
}

function parseSourceQueryValue(
  value: string | string[] | undefined,
): string | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return ALL_FILTER_VALUE;
  }
  return extracted;
}

function parseEmbeddingModelQueryValue(
  value: string | string[] | undefined,
): string | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return ALL_FILTER_VALUE;
  }
  return extracted;
}

function parsePageQueryValue(value: string | string[] | undefined): number {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return 1;
  }
  const parsed = Number.parseInt(extracted, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function parseDateQueryValue(value: string | string[] | undefined): string {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return "";
  }

  const parsed = new Date(extracted);
  if (Number.isNaN(parsed.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(extracted)) {
      return extracted;
    }
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function parseBooleanQueryValue(
  value: string | string[] | undefined,
  defaultValue: boolean,
): boolean {
  const extracted = extractQueryValue(value);
  return extracted ? extracted === "true" : defaultValue;
}

function getEmbeddingSpaceOption(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return EMBEDDING_MODEL_OPTION_MAP.get(value) ?? findEmbeddingSpace(value);
}

function formatEmbeddingSpaceLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown model";
  }
  const option = getEmbeddingSpaceOption(value);
  return option?.label ?? value;
}

function getEmbeddingSpaceIdFromMetadata(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) {
    return null;
  }

  const directKeys = [
    "embeddingSpaceId",
    "embedding_space_id",
    "embeddingModelId",
    "embedding_model_id",
    "embeddingModel",
    "embedding_model",
  ];

  for (const key of directKeys) {
    const value = getStringMetadata(metadata, key);
    if (!value) {
      continue;
    }
    const option = getEmbeddingSpaceOption(value);
    if (option) {
      return option.embeddingSpaceId;
    }
  }

  const provider =
    getStringMetadata(metadata, "embeddingProvider") ??
    getStringMetadata(metadata, "embedding_provider") ??
    null;
  const model =
    getStringMetadata(metadata, "embeddingModel") ??
    getStringMetadata(metadata, "embedding_model") ??
    getStringMetadata(metadata, "embeddingModelId") ??
    getStringMetadata(metadata, "embedding_model_id") ??
    null;
  const version =
    getStringMetadata(metadata, "embeddingVersion") ??
    getStringMetadata(metadata, "embedding_version") ??
    null;

  if (model) {
    const resolved = resolveEmbeddingSpace({
      provider,
      model,
      version,
    });
    return resolved.embeddingSpaceId;
  }

  return null;
}

function getEmbeddingFilterLabel(value: string): string {
  if (value === UNKNOWN_EMBEDDING_FILTER_VALUE) {
    return "Unknown";
  }
  return formatEmbeddingSpaceLabel(value);
}

function collectSources(runs: RunRecord[]): string[] {
  const sourceSet = new Set<string>();
  for (const run of runs) {
    if (typeof run.source === "string" && run.source.length > 0) {
      sourceSet.add(run.source);
    }
  }
  return Array.from(sourceSet).toSorted((a, b) => a.localeCompare(b));
}

function collectEmbeddingModels(runs: RunRecord[]): string[] {
  const spaceSet = new Set<string>();
  let hasUnknown = false;
  for (const run of runs) {
    const spaceId = getEmbeddingSpaceIdFromMetadata(run.metadata);
    if (spaceId) {
      spaceSet.add(spaceId);
    } else {
      hasUnknown = true;
    }
  }
  const sorted = Array.from(spaceSet).toSorted((a, b) => a.localeCompare(b));
  if (hasUnknown) {
    sorted.push(UNKNOWN_EMBEDDING_FILTER_VALUE);
  }
  return sorted;
}

function mergeEmbeddingModels(existing: string[], runs: RunRecord[]): string[] {
  const spaces = new Set(existing);
  let hasUnknown = existing.includes(UNKNOWN_EMBEDDING_FILTER_VALUE);

  for (const run of runs) {
    const spaceId = getEmbeddingSpaceIdFromMetadata(run.metadata);
    if (spaceId) {
      spaces.add(spaceId);
    } else {
      hasUnknown = true;
    }
  }

  const sorted = Array.from(spaces)
    .filter((value) => value !== UNKNOWN_EMBEDDING_FILTER_VALUE)
    .toSorted((a, b) => a.localeCompare(b));

  if (hasUnknown) {
    sorted.push(UNKNOWN_EMBEDDING_FILTER_VALUE);
  }

  return sorted;
}

function mergeSources(existing: string[], runs: RunRecord[]): string[] {
  if (runs.length === 0) {
    return existing;
  }

  const sourceSet = new Set(existing);
  for (const run of runs) {
    if (typeof run.source === "string" && run.source.length > 0) {
      sourceSet.add(run.source);
    }
  }
  return Array.from(sourceSet).toSorted((a, b) => a.localeCompare(b));
}

function createLogEntry(
  message: string,
  level: "info" | "warn" | "error",
): ManualLogEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    level,
    timestamp: Date.now(),
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateFormatter.format(date);
}

function formatDuration(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs < 0) {
    return "--";
  }

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function formatCharacters(characters: number | null | undefined): string {
  if (!characters || characters <= 0) {
    return "0 chars";
  }

  const approxBytes = characters;
  const units = ["B", "KB", "MB", "GB"];
  let size = approxBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${numberFormatter.format(characters)} chars (${size.toFixed(1)} ${
    units[unitIndex]
  })`;
}

function formatDeltaLabel(delta: number | null): string | null {
  if (delta === null || delta === 0) {
    return null;
  }
  const formatted = numberFormatter.format(Math.abs(delta));
  return delta > 0 ? `+${formatted}` : `-${formatted}`;
}

function formatPercentChange(current: number, previous: number): string | null {
  if (previous === 0) {
    return null;
  }
  const change = ((current - previous) / previous) * 100;
  if (!Number.isFinite(change) || change === 0) {
    return null;
  }
  const rounded = change.toFixed(1);
  const prefix = change > 0 ? "+" : "";
  return `${prefix}${rounded}%`;
}

function getStringMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function getNumericMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toSnapshotSummary(snapshot: SnapshotRecord): SnapshotSummary {
  return {
    id: snapshot.id,
    capturedAt: snapshot.capturedAt,
    embeddingSpaceId: snapshot.embeddingSpaceId,
    embeddingProvider: snapshot.embeddingProvider,
    embeddingLabel: snapshot.embeddingLabel,
    runId: snapshot.runId,
    runStatus: snapshot.runStatus,
    ingestionMode: snapshot.ingestionMode,
    schemaVersion: snapshot.schemaVersion,
    totalDocuments: snapshot.totalDocuments,
    totalChunks: snapshot.totalChunks,
    totalCharacters: snapshot.totalCharacters,
    deltaDocuments: snapshot.deltaDocuments,
    deltaChunks: snapshot.deltaChunks,
    deltaCharacters: snapshot.deltaCharacters,
  };
}

function buildSparklineData(
  values: number[],
): { path: string; min: number; max: number } | null {
  if (!values || values.length < 2) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values
    .map((value, index) => {
      const normalized = (value - min) / range;
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - normalized * 100;
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return { path, min, max };
}

function ManualIngestionPanel(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<"notion_page" | "url">("notion_page");
  const handleModeChange = (tabId: string) => {
    if (tabId === "notion_page" || tabId === "url") {
      setMode(tabId);
    }
  };
  const [notionInput, setNotionInput] = useState("");
  const [notionScope, setNotionScope] = useState<"partial" | "full">("partial");
  const [urlScope, setUrlScope] = useState<"partial" | "full">("partial");
  const [urlInput, setUrlInput] = useState("");
  const [includeLinkedPages, setIncludeLinkedPages] = useState(true);
  const [manualEmbeddingProvider, setManualEmbeddingProvider] =
    useState<string>(DEFAULT_MANUAL_EMBEDDING_SPACE_ID);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ManualIngestionStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<ManualLogEvent[]>([]);
  const [stats, setStats] = useState<ManualRunStats | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [overallProgress, setOverallProgress] = useState<{
    current: number;
    total: number;
    pageId: string | null;
    title: string | null;
  }>({
    current: 0,
    total: 0,
    pageId: null,
    title: null,
  });
  const overallProgressRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolledProgressRef = useRef(false);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem("manual_embedding_model");
    if (stored && getEmbeddingSpaceOption(stored)) {
      setManualEmbeddingProvider(stored);
    }
  }, []);

  const setEmbeddingProviderAndSave = useCallback((next: string) => {
    setManualEmbeddingProvider(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("manual_embedding_model", next);
    }
  }, []);

  const appendLog = useCallback(
    (message: string, level: "info" | "warn" | "error" = "info") => {
      if (!mountedRef.current) {
        return;
      }

      setLogs((prev) => [...prev, createLogEntry(message, level)]);
    },
    [],
  );

  const scrollProgressIntoViewOnce = useCallback(() => {
    if (hasAutoScrolledProgressRef.current) {
      return;
    }
    hasAutoScrolledProgressRef.current = true;
    queueMicrotask(() => {
      overallProgressRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const handleEvent = useCallback(
    (event: ManualEvent) => {
      if (!mountedRef.current) {
        return;
      }

      let completionMessage = "";
      let completionLevel: "info" | "warn" | "error" = "info";

      switch (event.type) {
        case "run":
          setRunId(event.runId);
          if (event.runId) {
            appendLog(`Supabase run ID: ${event.runId}`);
          }
          break;
        case "log":
          appendLog(event.message, event.level ?? "info");
          break;
        case "queue": {
          const safeTotal = Math.max(1, event.total ?? 1);
          const safeCurrent = Math.min(
            Math.max(event.current ?? 1, 1),
            safeTotal,
          );
          setOverallProgress({
            current: safeCurrent,
            total: safeTotal,
            pageId: event.pageId ?? null,
            title: event.title ?? null,
          });
          setProgress(0);
          scrollProgressIntoViewOnce();
          break;
        }
        case "progress":
          setProgress(Math.max(0, Math.min(100, event.percent)));
          break;
        case "complete":
          completionMessage =
            event.message ?? "Manual ingestion finished successfully.";
          completionLevel =
            event.status === "failed"
              ? "error"
              : event.status === "completed_with_errors"
                ? "warn"
                : "info";
          setStatus(event.status);
          setStats(event.stats);
          setRunId(event.runId);
          setFinalMessage(completionMessage);
          appendLog(completionMessage, completionLevel);
          setProgress(100);
          setOverallProgress((prev) =>
            prev.total > 0
              ? {
                  ...prev,
                  current: prev.total,
                }
              : prev,
          );
          setIsRunning(false);
          break;
        default:
          break;
      }
    },
    [
      appendLog,
      setRunId,
      setProgress,
      setStatus,
      setStats,
      setFinalMessage,
      setOverallProgress,
      setIsRunning,
      scrollProgressIntoViewOnce,
    ],
  );

  useEffect(() => {
    if (!isRunning && status !== "idle" && status !== "in_progress") {
      setHasCompleted(true);
    }
  }, [isRunning, status]);

  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container || !autoScrollLogs) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: logs.length <= 1 ? "auto" : "smooth",
    });
  }, [logs, autoScrollLogs]);

  const handleLogsScroll = useCallback(() => {
    const el = logsContainerRef.current;
    if (!el) {
      return;
    }
    if (autoScrollLogs) {
      return;
    }
  }, [autoScrollLogs]);

  const handleToggleAutoScroll = useCallback((checked: boolean) => {
    if (checked) {
      const el = logsContainerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      }
    }
    setAutoScrollLogs(checked);
  }, []);

  const startManualIngestion = useCallback(async () => {
    if (isRunning) {
      return;
    }

    let payload: ManualIngestionRequest;

    if (mode === "notion_page") {
      const parsed = parsePageId(notionInput.trim(), { uuid: true });
      if (!parsed) {
        setErrorMessage("Enter a valid Notion page ID or URL.");
        return;
      }
      payload = {
        mode: "notion_page",
        pageId: parsed,
        ingestionType: notionScope,
        includeLinkedPages,
        embeddingModel: manualEmbeddingProvider,
        embeddingSpaceId: manualEmbeddingProvider,
      };
    } else {
      const trimmed = urlInput.trim();
      if (!trimmed) {
        setErrorMessage("Enter at least one URL to ingest.");
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        setErrorMessage("Enter a valid URL.");
        return;
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        setErrorMessage("Only HTTP and HTTPS URLs are supported.");
        return;
      }

      payload = {
        mode: "url",
        url: parsedUrl.toString(),
        ingestionType: urlScope,
        embeddingModel: manualEmbeddingProvider,
        embeddingSpaceId: manualEmbeddingProvider,
      };
    }

    if (!mountedRef.current) {
      return;
    }

    setErrorMessage(null);
    setIsRunning(true);
    setStatus("in_progress");
    setProgress(0);
    setRunId(null);
    setFinalMessage(null);
    setStats(null);
    setHasCompleted(false);
    setOverallProgress({
      current: 0,
      total: 0,
      pageId: null,
      title: null,
    });
    setAutoScrollLogs(true);
    const startLog =
      mode === "notion_page"
        ? `Starting manual ${notionScope} ingestion for the Notion page${
            includeLinkedPages ? " (including linked pages)" : ""
          }.`
        : `Starting manual ${urlScope} ingestion for the provided URL.`;
    hasAutoScrolledProgressRef.current = false;
    scrollProgressIntoViewOnce();
    setLogs([createLogEntry(startLog, "info")]);

    try {
      const response = await fetch("/api/admin/manual-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = `Request failed. (${response.status})`;
        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          try {
            const data = (await response.json()) as { error?: unknown };
            if (
              typeof data.error === "string" &&
              data.error.trim().length > 0
            ) {
              message = data.error.trim();
            }
          } catch {
            // ignore
          }
        } else {
          try {
            const text = await response.text();
            if (text.trim()) {
              message = text.trim();
            }
          } catch {
            // ignore
          }
        }

        throw new Error(message);
      }

      if (!response.body) {
        throw new Error(
          "Streaming responses are not supported in this browser.",
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      const forwardEvent = (event: ManualEvent) => {
        if (event.type === "complete") {
          completed = true;
        }
        handleEvent(event);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);

          if (raw) {
            const dataLine = raw
              .split("\n")
              .find((line: string) => line.startsWith("data:"));

            if (dataLine) {
              const payloadStr = dataLine.slice(5).trim();
              if (payloadStr) {
                try {
                  const event = JSON.parse(payloadStr) as ManualEvent;
                  forwardEvent(event);
                } catch {
                  // ignore malformed payloads
                }
              }
            }
          }

          boundary = buffer.indexOf("\n\n");
        }
      }

      if (buffer.trim()) {
        const dataLine = buffer
          .trim()
          .split("\n")
          .find((line: string) => line.startsWith("data:"));

        if (dataLine) {
          const payloadStr = dataLine.slice(5).trim();
          if (payloadStr) {
            try {
              const event = JSON.parse(payloadStr) as ManualEvent;
              forwardEvent(event);
            } catch {
              // ignore malformed payloads
            }
          }
        }
      }

      if (!completed && mountedRef.current) {
        const message = "Manual ingestion ended unexpectedly.";
        setStatus("failed");
        setProgress((prev) => Math.max(prev, 100));
        setFinalMessage(message);
        appendLog(message, "error");
      }
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : "An error occurred while running manual ingestion.";
      setStatus("failed");
      setProgress((prev) => Math.max(prev, 100));
      setFinalMessage(message);
      appendLog(message, "error");
    } finally {
      if (mountedRef.current) {
        setIsRunning(false);
      }
    }
  }, [
    isRunning,
    mode,
    notionInput,
    notionScope,
    includeLinkedPages,
    urlInput,
    urlScope,
    manualEmbeddingProvider,
    handleEvent,
    appendLog,
    scrollProgressIntoViewOnce,
  ]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void startManualIngestion();
    },
    [startManualIngestion],
  );

  const renderScopeSelector = (
    scope: "partial" | "full",
    setScope: (value: "partial" | "full") => void,
    groupName: string,
    labelId: string,
  ) => (
    <GridPanel
      as="fieldset"
      className="px-4 py-4"
      role="radiogroup"
      aria-labelledby={labelId}
    >
      <div className="space-y-3">
        <legend
          id={labelId}
          className="ai-section-caption uppercase tracking-[0.15em]"
        >
          {"Ingestion scope"}
        </legend>
        <div className="grid grid-cols-[minmax(150px,1fr)_repeat(1,minmax(0,1fr))] gap-3 items-center">
          <ScopeTile
            name={groupName}
            value="partial"
            label="Only pages with changes"
            description="Run ingestion only if new content is detected since the last run."
            checked={scope === "partial"}
            disabled={isRunning}
            onChange={setScope}
          />
          <ScopeTile
            name={groupName}
            value="full"
            label="For any pages"
            description="Force ingestion even when nothing appears to have changed."
            checked={scope === "full"}
            disabled={isRunning}
            onChange={setScope}
          />
        </div>

        <p className="ai-meta-text">
          {scope === "full"
            ? "Use to refresh embeddings manually; runs even without detected changes."
            : "Best when you update content occasionally and want to skip no-op runs."}
        </p>
      </div>
    </GridPanel>
  );

  const totalPages = overallProgress.total;
  const completedPages =
    totalPages > 0 ? Math.max(0, overallProgress.current - 1) : 0;
  const stagePercent = Math.max(0, Math.min(100, progress));
  const overallPercent =
    totalPages > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((completedPages + stagePercent / 100) / totalPages) * 100,
          ),
        )
      : stagePercent;
  const overallCurrentLabel =
    totalPages > 0 ? Math.min(overallProgress.current, totalPages) : 0;
  const activePageTitle = overallProgress.title ?? null;
  const activePageId = overallProgress.pageId ?? null;
  const showOverallProgress = totalPages > 1;
  const stageSubtitle = activePageTitle ?? activePageId;

  return (
    <>
      <section className="ai-card space-y-6">
        <CardHeader className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <CardTitle icon={<FiPlayCircle aria-hidden="true" />}>
              Manual Ingestion
            </CardTitle>
            <p className="ai-card-description max-w-[38rem]">
              Trigger manual ingestion for a Notion page or external URL and
              track the progress here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill variant={manualStatusVariantMap[status]}>
              {manualStatusLabels[status]}
            </StatusPill>
            {runId ? (
              <span className="ai-meta-text">Run ID: {runId}</span>
            ) : null}
          </div>
        </CardHeader>

        <div className="ai-card-content space-y-6">
          <div className="grid gap-6 md:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] md:items-start">
            <div className="grid gap-5">
              <div
                className="ai-tab-pill-group w-full"
                role="tablist"
                aria-label="Manual ingestion source"
              >
                <TabPill
                  id="tabs-notion_page"
                  aria-controls="tabpanel-notion_page"
                  title="Notion Page"
                  subtitle="Sync from your workspace"
                  active={mode === "notion_page"}
                  onClick={() => handleModeChange("notion_page")}
                  disabled={isRunning}
                />
                <TabPill
                  id="tabs-url"
                  aria-controls="tabpanel-url"
                  title="External URL"
                  subtitle="Fetch a public article"
                  active={mode === "url"}
                  onClick={() => handleModeChange("url")}
                  disabled={isRunning}
                />
              </div>

              <form
                className="grid gap-4 p-5"
                onSubmit={handleSubmit}
                noValidate
              >
                <TabPanel
                  tabId="notion_page"
                  activeTabId={mode}
                  className="space-y-3"
                >
                  <div className="space-y-2">
                    <Label htmlFor="manual-notion-input">
                      Notion Page ID or URL
                    </Label>
                    <Input
                      id="manual-notion-input"
                      type="text"
                      placeholder="https://www.notion.so/... or page ID"
                      value={notionInput}
                      onChange={(event) => setNotionInput(event.target.value)}
                      disabled={isRunning}
                    />
                  </div>
                  {renderScopeSelector(
                    notionScope,
                    setNotionScope,
                    "manual-scope-notion",
                    "manual-scope-label-notion",
                  )}
                  <div className="flex items-start gap-2">
                    <Checkbox
                      aria-labelledby="manual-linked-pages-label"
                      aria-describedby="manual-linked-pages-hint"
                      checked={includeLinkedPages}
                      onCheckedChange={setIncludeLinkedPages}
                      disabled={isRunning}
                    />
                    <div className="flex flex-col gap-1">
                      <Label size="sm" id="manual-linked-pages-label">
                        Include linked pages
                      </Label>
                      <p className="ai-meta-text" id="manual-linked-pages-hint">
                        Also ingest child pages and any pages referenced via
                        Notion link-to-page blocks.
                      </p>
                    </div>
                  </div>
                  <p className="ai-meta-text">
                    Paste the full shared link or the 32-character page ID from
                    Notion. Use the controls above to define scope and whether
                    linked pages are included.
                  </p>
                </TabPanel>

                <TabPanel tabId="url" activeTabId={mode} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="manual-url-input">URL to ingest</Label>
                    <Input
                      id="manual-url-input"
                      type="url"
                      placeholder="https://example.com/article"
                      value={urlInput}
                      onChange={(event) => setUrlInput(event.target.value)}
                      disabled={isRunning}
                    />
                  </div>
                  {renderScopeSelector(
                    urlScope,
                    setUrlScope,
                    "manual-scope-url",
                    "manual-scope-label-url",
                  )}
                  <p className="ai-meta-text">
                    Enter a public HTTP(S) link. Use the scope above to skip
                    unchanged articles or force a full refresh.
                  </p>
                </TabPanel>

                <div className="space-y-2">
                  <Label htmlFor="manual-provider-select">
                    Embedding model
                  </Label>
                  <Select
                    value={manualEmbeddingProvider}
                    onValueChange={(value) =>
                      setEmbeddingProviderAndSave(value)
                    }
                    disabled={isRunning}
                  >
                    <SelectTrigger
                      id="manual-provider-select"
                      aria-label="Select embedding model"
                    />
                    <SelectContent>
                      {EMBEDDING_MODEL_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.embeddingSpaceId}
                          value={option.embeddingSpaceId}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="ai-meta-text">
                    Determines which embedding space is used for this run.
                  </p>
                </div>

                {errorMessage ? (
                  <div role="alert">
                    <p className="ai-meta-text text-[color:var(--ai-error)]">
                      {errorMessage}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Button type="submit" disabled={isRunning}>
                    {isRunning ? "Running" : "Run manually"}
                  </Button>

                  <div
                    className="flex-1 min-w-[240px] flex flex-col gap-4 text-sm"
                    aria-live="polite"
                  >
                    {showOverallProgress ? (
                      <div ref={overallProgressRef}>
                        <ProgressGroup
                          label="Overall Progress"
                          meta={`${overallCurrentLabel} / ${totalPages}`}
                          value={overallPercent}
                        />
                      </div>
                    ) : null}

                    <ProgressGroup
                      label={showOverallProgress ? "Current Page" : "Progress"}
                      meta={stageSubtitle ?? undefined}
                      value={stagePercent}
                      footer={
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="ai-meta-text font-semibold">
                            {Math.round(stagePercent)}%
                          </span>
                          {showOverallProgress &&
                          activePageId &&
                          activePageTitle ? (
                            <span className="ai-meta-text rounded-full bg-[color:var(--ai-border-soft)] px-2 py-0.5 text-xs font-mono">
                              {activePageId}
                            </span>
                          ) : null}
                          {finalMessage ? (
                            <span className="ai-meta-text">{finalMessage}</span>
                          ) : null}
                        </div>
                      }
                    />
                  </div>
                </div>
              </form>
            </div>

            <Card className="space-y-4" aria-label="Manual ingestion tips">
              <CardContent className="space-y-4">
                <h3 className="ai-section-title text-lg">Tips</h3>
                <ul className="grid gap-2 pl-4 text-sm text-[color:var(--ai-text-muted)]">
                  <li>
                    Ensure the Notion page is shared and accessible with the
                    integration token.
                  </li>
                  <li>
                    Long articles are chunked automatically; you can rerun to
                    refresh the data.
                  </li>
                  <li>
                    External URLs should be static pages without paywalls or
                    heavy scripts.
                  </li>
                </ul>
                <TipCallout title="Heads up">
                  Manual runs are processed immediately and may take a few
                  seconds depending on the content size.
                </TipCallout>
              </CardContent>
            </Card>
          </div>
        </div>

        <section className="space-y-4 p-6 border-none">
          <Card>
            <CardHeader className="flex flex-wrap items-left justify-between gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle icon={<FiList aria-hidden="true" />}>
                  Run Log
                </CardTitle>
                <span className="ai-card-description">
                  {logs.length === 0
                    ? "Awaiting events"
                    : `${logs.length} entr${logs.length === 1 ? "y" : "ies"}`}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 text-xs text-[color:var(--ai-text-muted)] select-none">
                <Checkbox
                  className="shrink-0"
                  aria-label="Toggle auto-scroll to newest log entries"
                  checked={autoScrollLogs}
                  onCheckedChange={handleToggleAutoScroll}
                />
                <span>Auto-scroll to latest</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {logs.length === 0 ? (
                <div className="text-center py-3 ai-meta-text">
                  Execution logs will appear here.
                </div>
              ) : (
                <div
                  className="max-h-[260px] overflow-y-auto pr-2"
                  ref={logsContainerRef}
                  onScroll={handleLogsScroll}
                >
                  <ul className="grid list-none gap-3 p-0">
                    {logs.map((log) => {
                      const Icon = LOG_ICONS[log.level];
                      return (
                        <ManualLogEntry
                          key={log.id}
                          level={log.level}
                          icon={<Icon aria-hidden={true} />}
                          timestamp={logTimeFormatter.format(
                            new Date(log.timestamp),
                          )}
                          message={log.message}
                        />
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {stats ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle icon={<FiBarChart2 aria-hidden="true" />}>
                Run Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 m-0 p-0">
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-[0.65rem] uppercase tracking-[0.2em] text-[color:var(--ai-text-muted)]">
                      Documents Processed
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(stats.documentsProcessed)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-[0.65rem] uppercase tracking-[0.2em] text-[color:var(--ai-text-muted)]">
                      Documents Added
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(stats.documentsAdded)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-[0.65rem] uppercase tracking-[0.2em] text-[color:var(--ai-text-muted)]">
                      Documents Updated
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(stats.documentsUpdated)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt>Documents Skipped</dt>
                    <dd>{numberFormatter.format(stats.documentsSkipped)}</dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt>Chunks Added</dt>
                    <dd>{numberFormatter.format(stats.chunksAdded)}</dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt>Chunks Updated</dt>
                    <dd>{numberFormatter.format(stats.chunksUpdated)}</dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt>Characters Added</dt>
                    <dd>{numberFormatter.format(stats.charactersAdded)}</dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt>Characters Updated</dt>
                    <dd>{numberFormatter.format(stats.charactersUpdated)}</dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-[0.2em] text-[color:var(--ai-text-muted)]">
                      Errors
                    </dt>
                    <dd className="text-lg font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(stats.errorCount)}
                    </dd>
                  </CardContent>
                </Card>
              </dl>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {hasCompleted && !isRunning ? (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <p className="ai-meta-text">
            Ingestion run completed. Refresh the dashboard to see the latest
            data.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void router.replace(router.asPath);
            }}
          >
            Refresh Dashboard
          </Button>
        </Card>
      ) : null}
    </>
  );
}

function DatasetSnapshotSection({
  overview,
}: {
  overview: DatasetSnapshotOverview;
}): JSX.Element {
  const { latest, history } = overview;
  const embeddingLabel = latest
    ? formatEmbeddingSpaceLabel(latest.embeddingSpaceId)
    : "Unknown model";
  const previous = history.length > 1 ? history[1] : null;
  const percentChange =
    latest && previous
      ? formatPercentChange(latest.totalDocuments, previous.totalDocuments)
      : null;
  const sparklineData = buildSparklineData(
    history.toReversed().map((entry) => entry.totalDocuments),
  );

  const historyList = history.slice(0, SNAPSHOT_HISTORY_LIMIT);

  if (!latest) {
    return (
      <section className="ai-card space-y-4 p-6">
        <CardHeader>
          <CardTitle icon={<FiDatabase aria-hidden="true" />}>
            Dataset Snapshot
          </CardTitle>
          <p className="ai-card-description">
            Snapshot history will appear after the next successful ingestion
            run.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-[0.35rem] border border-dashed border-[color:var(--ai-border-accent)] rounded-[14px] px-6 py-4 bg-[color-mix(in_srgb,var(--ai-surface)_75%,transparent)] text-[color:var(--ai-text-soft)]">
            <p>No snapshot records found.</p>
            <p>Run an ingestion job to capture the initial dataset state.</p>
          </div>
        </CardContent>
      </section>
    );
  }

  const metrics = [
    {
      key: "documents",
      label: "Documents",
      value: numberFormatter.format(latest.totalDocuments),
      delta: latest.deltaDocuments,
    },
    {
      key: "chunks",
      label: "Chunks",
      value: numberFormatter.format(latest.totalChunks),
      delta: latest.deltaChunks,
    },
    {
      key: "characters",
      label: "Characters",
      value: formatCharacters(latest.totalCharacters),
      delta: latest.deltaCharacters,
    },
  ];

  return (
    <section className="ai-card space-y-6 p-6">
      <CardHeader>
        <CardTitle icon={<FiDatabase aria-hidden="true" />}>
          Dataset Snapshot
        </CardTitle>
        <p className="ai-card-description">
          Latest captured totals from the `rag_snapshot` rollup.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <GridPanel className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[1.1rem]">
          {metrics.map((metric) => {
            const deltaLabel = formatDeltaLabel(metric.delta);
            const tone =
              metric.delta === null
                ? undefined
                : metric.delta > 0
                  ? "success"
                  : "error";
            return (
              <StatCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                delta={
                  deltaLabel
                    ? { text: deltaLabel, tone: tone ?? "muted" }
                    : undefined
                }
              />
            );
          })}
          <Card className="md:col-span-2">
            <CardContent className="space-y-3">
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-[color:var(--ai-text-muted)]">
                Trend
              </p>
              {sparklineData ? (
                <>
                  <svg
                    className="w-full h-[80px]"
                    viewBox="0 0 100 100"
                    role="img"
                    aria-label="Snapshot trend sparkline"
                  >
                    <path
                      className="fill-none stroke-[color-mix(in_srgb,var(--ai-accent)_90%,transparent)] stroke-2"
                      d={sparklineData.path}
                    />
                  </svg>
                  <div className="mt-[0.35rem] flex justify-between text-[0.8rem] text-[color:var(--ai-text-muted)]">
                    <span className="ai-meta-text">
                      Min: {numberFormatter.format(sparklineData.min)} · Max:{" "}
                      {numberFormatter.format(sparklineData.max)}
                    </span>
                    {percentChange ? (
                      <span className="ai-meta-text">
                        {percentChange} vs prev.
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <span className="ai-meta-text">
                  More history needed for trend
                </span>
              )}
            </CardContent>
          </Card>
        </GridPanel>
        <dl className="mt-6">
          <GridPanel className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 text-[0.72rem] uppercase tracking-[0.06em] text-[color:var(--ai-text-muted)]">
                Embedding Model
              </dt>
              <dd className="mt-[0.15rem] text-[0.95rem] text-[color:var(--ai-text-soft)]">
                {embeddingLabel}
              </dd>
            </div>
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 text-[0.72rem] uppercase tracking-[0.06em] text-[color:var(--ai-text-muted)]">
                Ingestion Mode
              </dt>
              <dd className="mt-[0.15rem] text-[0.95rem] text-[color:var(--ai-text-soft)]">
                {latest.ingestionMode ?? "—"}
              </dd>
            </div>
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 text-[0.72rem] uppercase tracking-[0.06em] text-[color:var(--ai-text-muted)]">
                Captured
              </dt>
              <dd className="mt-[0.15rem] text-[0.95rem] text-[color:var(--ai-text-soft)]">
                {latest.capturedAt ? (
                  <ClientSideDate value={latest.capturedAt} />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 text-[0.72rem] uppercase tracking-[0.06em] text-[color:var(--ai-text-muted)]">
                Source Run
              </dt>
              <dd className="mt-[0.15rem] text-[0.95rem] text-[color:var(--ai-text-soft)]">
                {latest.runId ? (
                  <code className="font-mono text-[0.82rem] bg-[color:var(--ai-border-soft)] px-1.5 py-0.5 rounded-md">
                    {latest.runId}
                  </code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="ai-panel shadow-none border-[color:var(--ai-border-muted)] rounded-[12px] bg-[color:var(--ai-surface-tint)] px-4 py-3">
              <dt className="m-0 text-[0.72rem] uppercase tracking-[0.06em] text-[color:var(--ai-text-muted)]">
                Schema Version
              </dt>
              <dd className="mt-[0.15rem] text-[0.95rem] text-[color:var(--ai-text-soft)]">
                {latest.schemaVersion ?? "—"}
              </dd>
            </div>
          </GridPanel>
        </dl>
        <section className="ai-panel mt-6 space-y-3 shadow-none border-[color:var(--ai-border-muted)] rounded-[14px] bg-[color:var(--ai-surface)] px-5 py-4">
          <header className="flex flex-col gap-1 mb-3">
            <HeadingWithIcon
              as="h3"
              icon={<FiClock aria-hidden="true" />}
              className="text-[1.05rem] font-semibold text-[color:var(--ai-text-strong)]"
            >
              Recent Snapshots{" "}
              <span className="ml-1.5 text-[0.85rem] text-[color:var(--ai-text-muted)]">
                ({historyList.length})
              </span>
            </HeadingWithIcon>
            <p className="m-0 text-[0.85rem] text-[color:var(--ai-text-muted)]">
              Comparing the most recent {historyList.length} captures.
            </p>
          </header>
          <ul className="list-none p-0 m-0 grid gap-[0.7rem]">
            {historyList.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-[color:var(--ai-border-soft)] last:border-b-0"
              >
                <div className="flex flex-col gap-[0.2rem]">
                  <div>
                    <span className="block text-[0.9rem] text-[color:var(--ai-text-soft)]">
                      {entry.capturedAt ? (
                        <ClientSideDate value={entry.capturedAt} />
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="block text-[0.8rem] text-[color:var(--ai-text-muted)]">
                      {formatEmbeddingSpaceLabel(entry.embeddingSpaceId)}
                    </span>
                  </div>
                  <div className="flex gap-2.5 text-[0.8rem] text-[color:var(--ai-text-muted)]">
                    <span>
                      Docs: {numberFormatter.format(entry.totalDocuments)} (
                      {formatDeltaLabel(entry.deltaDocuments) ?? "0"})
                    </span>
                    <span>
                      Chunks: {numberFormatter.format(entry.totalChunks)} (
                      {formatDeltaLabel(entry.deltaChunks) ?? "0"})
                    </span>
                  </div>
                </div>
                {index === 0 ? (
                  <span className="text-[0.75rem] uppercase tracking-[0.05em] px-2 py-1 rounded-full bg-[color:var(--ai-accent-bg)] text-[color:var(--ai-accent-strong)] font-semibold">
                    Latest
                  </span>
                ) : (
                  <span className="text-[0.75rem] uppercase tracking-[0.05em] px-2 py-1 rounded-full bg-[color:var(--ai-border-soft)] text-[color:var(--ai-text-muted)] font-semibold">
                    #{index + 1}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </section>
  );
}

function SystemHealthSection({
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
        <GridPanel className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[1.1rem]">
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
                    <code className="font-mono text-[0.82rem] bg-[color:var(--ai-border-soft)] px-1.5 py-0.5 rounded-md">
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
                <span className="ai-meta-text">
                  Errors: {numberFormatter.format(health.errorCount ?? 0)}
                </span>
                <span className="ai-meta-text">
                  Skipped Docs:{" "}
                  {numberFormatter.format(health.documentsSkipped ?? 0)}
                </span>
              </div>
            }
            meta={
              <span className="ai-meta-text">Derived from the latest run.</span>
            }
          />
          <StatCard
            label="Queue Health"
            value={
              <div className="space-y-1">
                <span className="ai-meta-text">
                  Queue Depth: {health.queueDepth ?? "—"}
                </span>
                <span className="ai-meta-text">
                  Pending Runs: {health.pendingRuns ?? "—"}
                </span>
                <span className="ai-meta-text">
                  Retry Count: {health.retryCount ?? "—"}
                </span>
              </div>
            }
            meta={
              <span className="ai-meta-text">
                Values are captured when the snapshot was recorded.
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
                <span className="ai-meta-text">No failures recorded.</span>
              )
            }
            meta={
              health.lastFailureRunId ? (
                <div className="space-y-1">
                  <span className="ai-meta-text">
                    Run ID:{" "}
                    <code className="font-mono text-[0.82rem] bg-[color:var(--ai-border-soft)] px-1.5 py-0.5 rounded-md">
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

function RecentRunsSection({
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
            {run.partial_reason ? (
              <p className="ai-meta-text font-normal normal-case">
                {run.partial_reason}
              </p>
            ) : null}
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
          const entries: Array<{ label: string; value: ReactNode }> = [];
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
    <section className="ai-card space-y-6 p-6">
      <CardHeader>
        <CardTitle icon={<FiLayers aria-hidden="true" />}>
          Recent Runs
        </CardTitle>
        <p className="ai-card-description">
          Latest ingestion activity from manual and scheduled jobs.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-3 mb-3 flex-col items-stretch md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-start gap-2.5">
            <div className="flex flex-col gap-1 min-w-[180px]">
              <Label htmlFor="recent-status-filter">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  handleStatusChange(
                    value as RunStatus | typeof ALL_FILTER_VALUE,
                  )
                }
              >
                <SelectTrigger
                  id="recent-status-filter"
                  aria-label="Filter runs by status"
                />
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All statuses</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <Label htmlFor="recent-type-filter">Type</Label>
              <Select
                value={ingestionTypeFilter}
                onValueChange={(value) =>
                  handleIngestionTypeChange(
                    value as IngestionType | typeof ALL_FILTER_VALUE,
                  )
                }
              >
                <SelectTrigger
                  id="recent-type-filter"
                  aria-label="Filter runs by ingestion type"
                />
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All types</SelectItem>
                  {ingestionTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getIngestionTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <Label htmlFor="recent-source-filter">Source</Label>
              <Select
                value={sourceFilter}
                onValueChange={(value) => handleSourceChange(value)}
              >
                <SelectTrigger
                  id="recent-source-filter"
                  aria-label="Filter runs by source"
                />
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All sources</SelectItem>
                  {sourceOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <Label htmlFor="recent-embedding-filter">Embedding model</Label>
              <Select
                value={embeddingProviderFilter}
                onValueChange={(value) => handleEmbeddingProviderChange(value)}
              >
                <SelectTrigger
                  id="recent-embedding-filter"
                  aria-label="Filter runs by embedding model"
                />
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All models</SelectItem>
                  {embeddingProviderOptions.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {getEmbeddingFilterLabel(provider)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <Label htmlFor="recent-started-from">Started After</Label>
              <Input
                id="recent-started-from"
                type="date"
                value={startedFromFilter}
                max={
                  startedToFilter && startedToFilter.length > 0
                    ? startedToFilter
                    : undefined
                }
                onChange={handleStartedFromChange}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <Label htmlFor="recent-started-to">Started Before</Label>
              <Input
                id="recent-started-to"
                type="date"
                value={startedToFilter}
                min={
                  startedFromFilter && startedFromFilter.length > 0
                    ? startedFromFilter
                    : undefined
                }
                onChange={handleStartedToChange}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 justify-end md:justify-start">
            <div className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ai-text-soft)] select-none">
              <Checkbox
                className="flex-shrink-0"
                checked={hideSkipped}
                onCheckedChange={handleHideSkippedChange}
                disabled={isLoading}
                aria-label="Hide skipped runs"
              />
              <span className="ai-meta-text">Hide skipped runs</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              disabled={!canReset}
            >
              Reset view
            </Button>
          </div>
        </div>
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
                Page {numberFormatter.format(page)} of{" "}
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

function IngestionDashboard({
  datasetSnapshot,
  systemHealth,
  recentRuns,
  headerRecordMap,
  headerBlockId,
}: PageProps): JSX.Element {
  return (
    <>
      <Head>
        <title>Ingestion Dashboard</title>
      </Head>

      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
      >
        <Card className="mb-6">
          <CardHeader className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle icon={<FiPlayCircle aria-hidden="true" />}>
                Ingestion Dashboard
              </CardTitle>
              <p className="ai-card-description">
                Monitor ingestion health, trigger manual runs, and review the
                latest dataset snapshot.
              </p>
            </div>
            <LinkButton href="/admin/chat-config" variant="outline">
              Chat Configuration
            </LinkButton>
          </CardHeader>
        </Card>

        <ManualIngestionPanel />

        <DatasetSnapshotSection overview={datasetSnapshot} />
        <SystemHealthSection health={systemHealth} />

        <RecentRunsSection initial={recentRuns} />
      </AiPageChrome>
    </>
  );
}

function ClientSideDate({ value }: { value: string | null | undefined }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    // Show a placeholder during server rendering and initial client rendering.
    // This ensures that the initial UI matches between the server and the client.
    return <span>--</span>;
  }

  return <>{formatDate(value)}</>;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (
  _context,
  // No changes needed here for now, filtering will be client-driven
) => {
  const headerRecordMapPromise = loadNotionNavigationHeader();

  const supabase = getSupabaseAdminClient();
  const pageSize = DEFAULT_RUNS_PAGE_SIZE;
  const canonicalLookup = await loadCanonicalPageLookup();

  const { data: snapshotRows } = await supabase
    .from("rag_snapshot")
    .select(
      "id, captured_at, schema_version, run_id, run_status, run_started_at, run_ended_at, run_duration_ms, run_error_count, run_documents_skipped, embedding_provider, ingestion_mode, total_documents, total_chunks, total_characters, delta_documents, delta_chunks, delta_characters, error_count, skipped_documents, queue_depth, retry_count, pending_runs, metadata",
    )
    .order("captured_at", { ascending: false })
    .limit(SNAPSHOT_HISTORY_LIMIT);

  const { data: runsData, count: runsCount } = await supabase
    .from("rag_ingest_runs")
    .select(
      "id, source, ingestion_type, partial_reason, status, started_at, ended_at, duration_ms, documents_processed, documents_added, documents_updated, documents_skipped, chunks_added, chunks_updated, characters_added, characters_updated, error_count, error_logs, metadata",
      { count: "exact" },
    )
    .order("started_at", { ascending: false })
    .range(0, pageSize - 1);

  const runs: RunRecord[] = (runsData ?? []).map((run: unknown) =>
    normalizeRunRecord(run),
  );
  for (const run of runs) {
    const pageId = getStringMetadata(run.metadata, "pageId");
    const publicUrl = resolvePublicPageUrl(pageId, canonicalLookup);
    if (publicUrl) {
      run.metadata = {
        ...run.metadata,
        publicPageUrl: publicUrl,
      };
    }
  }
  const totalCount = runsCount ?? runs.length;
  const totalPages =
    pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const snapshotRecords: SnapshotRecord[] = (snapshotRows ?? [])
    .map((row: unknown) => normalizeSnapshotRecord(row))
    .filter(
      (entry: SnapshotRecord | null): entry is SnapshotRecord => entry !== null,
    );

  const snapshotSummaries = snapshotRecords.map((snapshot) =>
    toSnapshotSummary(snapshot),
  );

  const datasetSnapshot: DatasetSnapshotOverview = {
    latest: snapshotSummaries[0] ?? null,
    history: snapshotSummaries,
  };

  const latestSnapshotRecord = snapshotRecords[0] ?? null;
  const latestRun = runs[0] ?? null;
  const lastFailureRun =
    runs.find(
      (run) =>
        run.status === "failed" || run.status === "completed_with_errors",
    ) ?? null;

  const systemHealth: SystemHealthOverview = {
    runId: latestSnapshotRecord?.runId ?? latestRun?.id ?? null,
    status:
      latestSnapshotRecord?.runStatus ??
      (latestRun ? latestRun.status : "unknown"),
    startedAt:
      latestSnapshotRecord?.runStartedAt ?? latestRun?.started_at ?? null,
    endedAt: latestSnapshotRecord?.runEndedAt ?? latestRun?.ended_at ?? null,
    durationMs:
      latestSnapshotRecord?.runDurationMs ?? latestRun?.duration_ms ?? null,
    errorCount:
      latestSnapshotRecord?.errorCount ??
      latestSnapshotRecord?.runErrorCount ??
      latestRun?.error_count ??
      null,
    documentsSkipped:
      latestSnapshotRecord?.skippedDocuments ??
      latestSnapshotRecord?.runDocumentsSkipped ??
      latestRun?.documents_skipped ??
      null,
    queueDepth: latestSnapshotRecord?.queueDepth ?? null,
    retryCount: latestSnapshotRecord?.retryCount ?? null,
    pendingRuns: latestSnapshotRecord?.pendingRuns ?? null,
    lastFailureRunId: lastFailureRun?.id ?? null,
    lastFailureAt:
      lastFailureRun?.ended_at ?? lastFailureRun?.started_at ?? null,
    lastFailureStatus: lastFailureRun?.status ?? null,
    snapshotCapturedAt: latestSnapshotRecord?.capturedAt ?? null,
  };

  const { headerRecordMap, headerBlockId } = await headerRecordMapPromise;

  return {
    props: {
      datasetSnapshot,
      systemHealth,
      recentRuns: {
        runs,
        page: 1,
        pageSize,
        totalCount,
        totalPages,
      },
      headerRecordMap,
      headerBlockId,
    },
  };
};

export default IngestionDashboard;
