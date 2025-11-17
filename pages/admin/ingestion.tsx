import type { GetServerSideProps } from "next";
import { FiActivity } from "@react-icons/all-files/fi/FiActivity";
import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiBarChart2 } from "@react-icons/all-files/fi/FiBarChart2";
import { FiClock } from "@react-icons/all-files/fi/FiClock";
import { FiDatabase } from "@react-icons/all-files/fi/FiDatabase";
import { FiFileText } from "@react-icons/all-files/fi/FiFileText";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { FiLink } from "@react-icons/all-files/fi/FiLink";
import { FiList } from "@react-icons/all-files/fi/FiList";
import { FiPlayCircle } from "@react-icons/all-files/fi/FiPlayCircle";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ExtendedRecordMap } from "notion-types";
import { parsePageId } from "notion-utils";
import {
  type ChangeEvent,
  type ComponentType,
  type FormEvent,
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ModelProvider } from "@/lib/shared/model-provider";
import { AiPageChrome } from "@/components/AiPageChrome";
import { Checkbox } from "@/components/ui/checkbox";
import {   DEFAULT_EMBEDDING_SPACE_ID,
type EmbeddingSpace ,
  findEmbeddingSpace,
  listEmbeddingModelOptions,
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

type ManualLogEntry = {
  id: string;
  message: string;
  level: "info" | "warn" | "error";
  timestamp: number;
};

const LOG_ICONS: Record<
  ManualLogEntry["level"],
  ComponentType<{ "aria-hidden"?: boolean }>
> = {
  info: FiInfo,
  warn: FiAlertTriangle,
  error: FiAlertCircle,
};

const MANUAL_TABS = [
  {
    id: "notion_page" as const,
    label: "Notion Page",
    subtitle: "Sync from your workspace",
    icon: FiFileText,
  },
  {
    id: "url" as const,
    label: "External URL",
    subtitle: "Fetch a public article",
    icon: FiLink,
  },
] as const;

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
  return (
    EMBEDDING_MODEL_OPTION_MAP.get(value) ??
    findEmbeddingSpace(value)
  );
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

  const candidates = [
    getStringMetadata(metadata, "embeddingSpaceId"),
    getStringMetadata(metadata, "embedding_space_id"),
    getStringMetadata(metadata, "embeddingModelId"),
    getStringMetadata(metadata, "embedding_model_id"),
    getStringMetadata(metadata, "embeddingModel"),
    getStringMetadata(metadata, "embedding_model"),
    getStringMetadata(metadata, "embeddingProvider"),
  ];

  for (const value of candidates) {
    if (!value) continue;
    const option = getEmbeddingSpaceOption(value);
    if (option) {
      return option.embeddingSpaceId;
    }
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

function mergeEmbeddingModels(
  existing: string[],
  runs: RunRecord[],
): string[] {
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

  const sorted = Array.from(spaces).filter(
    (value) => value !== UNKNOWN_EMBEDDING_FILTER_VALUE,
  ).toSorted((a, b) => a.localeCompare(b));

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
): ManualLogEntry {
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

function getDeltaClass(delta: number | null): string {
  if (delta === null || delta === 0) {
    return "snapshot-card__delta--muted";
  }
  return delta > 0
    ? "snapshot-card__delta--positive"
    : "snapshot-card__delta--negative";
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
  const [notionInput, setNotionInput] = useState("");
  const [notionScope, setNotionScope] = useState<"partial" | "full">("partial");
  const [urlScope, setUrlScope] = useState<"partial" | "full">("partial");
  const [urlInput, setUrlInput] = useState("");
  const [includeLinkedPages, setIncludeLinkedPages] = useState(true);
  const [manualEmbeddingProvider, setManualEmbeddingProvider] = useState<string>(
    DEFAULT_MANUAL_EMBEDDING_SPACE_ID,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ManualIngestionStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<ManualLogEntry[]>([]);
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

  const activeTabId = `manual-tab-${mode}`;
  const renderScopeSelector = (
    scope: "partial" | "full",
    setScope: (value: "partial" | "full") => void,
    groupName: string,
    labelId: string,
  ) => (
    <fieldset
      className="manual-scope"
      role="radiogroup"
      aria-labelledby={labelId}
    >
      <legend id={labelId} className="manual-scope__label">
        {scopeCopy.label}
      </legend>
      <div className="manual-scope__controls">
        <label
          className={`manual-scope__option ${scope === "partial" ? "is-active" : ""} ${
            isRunning ? "is-disabled" : ""
          }`}
        >
          <input
            type="radio"
            name={groupName}
            value="partial"
            checked={scope === "partial"}
            onChange={() => setScope("partial")}
            disabled={isRunning}
          />
          <span className="manual-scope__title">{scopeCopy.partialTitle}</span>
          <span className="manual-scope__desc">{scopeCopy.partialDesc}</span>
        </label>
        <label
          className={`manual-scope__option ${scope === "full" ? "is-active" : ""} ${
            isRunning ? "is-disabled" : ""
          }`}
        >
          <input
            type="radio"
            name={groupName}
            value="full"
            checked={scope === "full"}
            onChange={() => setScope("full")}
            disabled={isRunning}
          />
          <span className="manual-scope__title">{scopeCopy.fullTitle}</span>
          <span className="manual-scope__desc">{scopeCopy.fullDesc}</span>
        </label>
      </div>
      <p className="manual-scope__hint">
        {scope === "full" ? scopeCopy.hintFull : scopeCopy.hintPartial}
      </p>
    </fieldset>
  );

  const scopeCopy = {
    label: "Ingestion scope",
    partialTitle: "Only pages with changes",
    partialDesc:
      "Run ingestion only if new content is detected since the last run.",
    fullTitle: "For any pages",
    fullDesc: "Force ingestion even when nothing appears to have changed.",
    hintPartial:
      "Best when you update content occasionally and want to skip no-op runs.",
    hintFull:
      "Use to refresh embeddings manually; runs even without detected changes.",
  };

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
      <section className="manual-ingestion admin-card">
        <header className="manual-ingestion__header">
          <div>
            <h2 className="heading-with-icon">
              <FiPlayCircle aria-hidden="true" />
              Manual Ingestion
            </h2>
            <p>
              Trigger manual ingestion for a Notion page or external URL and
              track the progress here.
            </p>
          </div>
          <div className="manual-ingestion__status">
            <span className={`status-pill status-pill--${status}`}>
              {manualStatusLabels[status]}
            </span>
            {runId ? (
              <span className="status-pill__meta">Run ID: {runId}</span>
            ) : null}
          </div>
        </header>

        <div className="manual-ingestion__layout">
          <div className="manual-ingestion__primary">
            <div
              className="manual-ingestion__tabs"
              role="tablist"
              aria-label="Manual ingestion source"
            >
              {MANUAL_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`manual-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`manual-panel-${tab.id}`}
                    className={`manual-tab ${isActive ? "manual-tab--active" : ""}`}
                    onClick={() => setMode(tab.id)}
                    disabled={isRunning}
                  >
                    <span className="manual-tab__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="manual-tab__copy">
                      <span className="manual-tab__title">{tab.label}</span>
                      <span className="manual-tab__subtitle">
                        {tab.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <form
              className="manual-form"
              aria-labelledby={activeTabId}
              id={`manual-panel-${mode}`}
              role="tabpanel"
              onSubmit={handleSubmit}
              noValidate
            >
              {mode === "notion_page" ? (
                <div className="manual-field">
                  <label htmlFor="manual-notion-input">
                    Notion Page ID or URL
                  </label>
                  <input
                    id="manual-notion-input"
                    type="text"
                    placeholder="https://www.notion.so/... or page ID"
                    value={notionInput}
                    onChange={(event) => setNotionInput(event.target.value)}
                    disabled={isRunning}
                  />
                </div>
              ) : (
                <div className="manual-field">
                  <label htmlFor="manual-url-input">URL to ingest</label>
                  <input
                    id="manual-url-input"
                    type="url"
                    placeholder="https://example.com/article"
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                    disabled={isRunning}
                  />
                </div>
              )}

              {mode === "notion_page"
                ? renderScopeSelector(
                    notionScope,
                    setNotionScope,
                    "manual-scope-notion",
                    "manual-scope-label-notion",
                  )
                : renderScopeSelector(
                    urlScope,
                    setUrlScope,
                    "manual-scope-url",
                    "manual-scope-label-url",
                  )}

              <div className="manual-field">
                <label htmlFor="manual-provider-select">
                  Embedding model
                </label>
                <select
                  id="manual-provider-select"
                  value={manualEmbeddingProvider}
                  onChange={(event) =>
                    setEmbeddingProviderAndSave(event.target.value)
                  }
                  disabled={isRunning}
                >
                  {EMBEDDING_MODEL_OPTIONS.map((option) => (
                    <option
                      key={option.embeddingSpaceId}
                      value={option.embeddingSpaceId}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="manual-field__hint">
                  Determines which embedding space is used for this run.
                </p>
              </div>

              {mode === "notion_page" ? (
                <div className="manual-toggle">
                  <Checkbox
                    className="manual-toggle__checkbox"
                    aria-labelledby="manual-linked-pages-label"
                    aria-describedby="manual-linked-pages-hint"
                    checked={includeLinkedPages}
                    onCheckedChange={setIncludeLinkedPages}
                    disabled={isRunning}
                  />
                  <div className="manual-toggle__content">
                    <span
                      className="manual-toggle__label"
                      id="manual-linked-pages-label"
                    >
                      Include linked pages
                    </span>
                    <p
                      className="manual-toggle__hint"
                      id="manual-linked-pages-hint"
                    >
                      Also ingest child pages and any pages referenced via
                      Notion link-to-page blocks.
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="manual-hint">
                {mode === "notion_page"
                  ? "Paste the full shared link or the 32-character page ID from Notion. Use the controls above to define scope and whether linked pages are included."
                  : "Enter a public HTTP(S) link. Use the scope above to skip unchanged articles or force a full refresh."}
              </p>

              {errorMessage ? (
                <div className="manual-error" role="alert">
                  {errorMessage}
                </div>
              ) : null}

              <div className="manual-actions">
                <button
                  type="submit"
                  className={`manual-button ${isRunning ? "is-loading" : ""}`}
                  disabled={isRunning}
                >
                  {isRunning ? "Running" : "Run manually"}
                </button>

                <div className="manual-progress" aria-live="polite">
                  {showOverallProgress ? (
                    <div className="progress-group" ref={overallProgressRef}>
                      <div className="progress-group__header">
                        <span className="progress-group__title">
                          Overall Progress
                        </span>
                        <span className="progress-group__meta">
                          {overallCurrentLabel} / {totalPages}
                        </span>
                      </div>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(overallPercent)}
                      >
                        <div
                          className="progress-bar__value"
                          style={{ width: `${overallPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="progress-group">
                    <div className="progress-group__header">
                      <span className="progress-group__title">
                        {showOverallProgress ? "Current Page" : "Progress"}
                      </span>
                      {stageSubtitle ? (
                        <span className="progress-group__meta">
                          {stageSubtitle}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="progress-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(stagePercent)}
                    >
                      <div
                        className="progress-bar__value"
                        style={{ width: `${stagePercent}%` }}
                      />
                    </div>
                    <div className="progress-meta">
                      <span className="progress-percent">
                        {Math.round(stagePercent)}%
                      </span>
                      {showOverallProgress &&
                      activePageId &&
                      activePageTitle ? (
                        <span className="progress-id">{activePageId}</span>
                      ) : null}
                      {finalMessage ? (
                        <span className="progress-message">{finalMessage}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <aside
            className="manual-ingestion__aside"
            aria-label="Manual ingestion tips"
          >
            <h3>Tips</h3>
            <ul>
              <li>
                Ensure the Notion page is shared and accessible with the
                integration token.
              </li>
              <li>
                Long articles are chunked automatically; you can rerun to
                refresh the data.
              </li>
              <li>
                External URLs should be static pages without paywalls or heavy
                scripts.
              </li>
            </ul>
            <div className="tip-callout">
              <strong>Heads up</strong>
              <p>
                Manual runs are processed immediately and may take a few seconds
                depending on the content size.
              </p>
            </div>
          </aside>
        </div>

        <section className="manual-logs" aria-live="polite">
          <header className="manual-logs__header">
            <div className="manual-logs__title">
              <h3 className="heading-with-icon">
                <FiList aria-hidden="true" />
                Run Log
              </h3>
              <span className="manual-logs__meta">
                {logs.length === 0
                  ? "Awaiting events"
                  : `${logs.length} entr${logs.length === 1 ? "y" : "ies"}`}
              </span>
            </div>
            <div className="manual-logs__autoscroll">
              <Checkbox
                className="manual-logs__autoscroll-checkbox"
                aria-label="Toggle auto-scroll to newest log entries"
                checked={autoScrollLogs}
                onCheckedChange={handleToggleAutoScroll}
              />
              <span>Auto-scroll to latest</span>
            </div>
          </header>
          {logs.length === 0 ? (
            <div className="manual-logs__empty">
              Execution logs will appear here.
            </div>
          ) : (
            <div
              className="manual-logs__scroll"
              ref={logsContainerRef}
              onScroll={handleLogsScroll}
            >
              <ul className="manual-logs__list">
                {logs.map((log) => {
                  const Icon = LOG_ICONS[log.level];
                  return (
                    <li
                      key={log.id}
                      className={`manual-log-entry manual-log-entry--${log.level}`}
                    >
                      <span
                        className="manual-log-entry__icon"
                        aria-hidden="true"
                      >
                        <Icon />
                      </span>
                      <div className="manual-log-entry__body">
                        <span className="manual-log-entry__time">
                          {logTimeFormatter.format(new Date(log.timestamp))}
                        </span>
                        <span className="manual-log-entry__message">
                          {log.message}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {stats ? (
          <section className="manual-summary">
            <h3 className="heading-with-icon">
              <FiBarChart2 aria-hidden="true" />
              Run Summary
            </h3>
            <dl className="summary-grid">
              <div className="summary-item">
                <dt>Documents Processed</dt>
                <dd>{numberFormatter.format(stats.documentsProcessed)}</dd>
              </div>
              <div className="summary-item">
                <dt>Documents Added</dt>
                <dd>{numberFormatter.format(stats.documentsAdded)}</dd>
              </div>
              <div className="summary-item">
                <dt>Documents Updated</dt>
                <dd>{numberFormatter.format(stats.documentsUpdated)}</dd>
              </div>
              <div className="summary-item">
                <dt>Documents Skipped</dt>
                <dd>{numberFormatter.format(stats.documentsSkipped)}</dd>
              </div>
              <div className="summary-item">
                <dt>Chunks Added</dt>
                <dd>{numberFormatter.format(stats.chunksAdded)}</dd>
              </div>
              <div className="summary-item">
                <dt>Chunks Updated</dt>
                <dd>{numberFormatter.format(stats.chunksUpdated)}</dd>
              </div>
              <div className="summary-item">
                <dt>Characters Added</dt>
                <dd>{numberFormatter.format(stats.charactersAdded)}</dd>
              </div>
              <div className="summary-item">
                <dt>Characters Updated</dt>
                <dd>{numberFormatter.format(stats.charactersUpdated)}</dd>
              </div>
              <div className="summary-item">
                <dt>Errors</dt>
                <dd>{numberFormatter.format(stats.errorCount)}</dd>
              </div>
            </dl>
          </section>
        ) : null}
      </section>

      {hasCompleted && !isRunning ? (
        <div className="admin-card manual-refresh-card">
          <p>
            Ingestion run completed. Refresh the dashboard to see the latest
            data.
          </p>
          <button
            type="button"
            className="manual-logs__refresh-button"
            onClick={() => {
              void router.replace(router.asPath);
            }}
          >
            Refresh Dashboard
          </button>
        </div>
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
      <section className="admin-card admin-section dataset-section">
        <header className="admin-section__header">
          <h2>Dataset Snapshot</h2>
          <p className="admin-section__description">
            Snapshot history will appear after the next successful ingestion
            run.
          </p>
        </header>
        <div className="snapshot-empty">
          <p>No snapshot records found.</p>
          <p>Run an ingestion job to capture the initial dataset state.</p>
        </div>
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
    <section className="admin-card admin-section dataset-section">
      <header className="admin-section__header">
        <h2 className="heading-with-icon">
          <FiDatabase aria-hidden="true" />
          Dataset Snapshot
        </h2>
        <p className="admin-section__description">
          Latest captured totals from the `rag_snapshot` rollup.
        </p>
      </header>
      <div className="snapshot-grid">
        {metrics.map((metric) => {
          const deltaLabel = formatDeltaLabel(metric.delta);
          return (
            <article key={metric.key} className="snapshot-card">
              <span className="snapshot-card__label">{metric.label}</span>
              <span className="snapshot-card__value">{metric.value}</span>
              <span
                className={`snapshot-card__delta ${getDeltaClass(metric.delta)}`}
              >
                {deltaLabel ?? "No change"}
              </span>
            </article>
          );
        })}
        <article className="snapshot-card snapshot-card--trend">
          <span className="snapshot-card__label">Trend</span>
          {sparklineData ? (
            <>
              <svg
                className="snapshot-sparkline"
                viewBox="0 0 100 100"
                role="img"
                aria-label="Snapshot trend sparkline"
              >
                <path d={sparklineData.path} />
              </svg>
              <div className="snapshot-card__trend-meta">
                <span>
                  Min: {numberFormatter.format(sparklineData.min)} · Max:{" "}
                  {numberFormatter.format(sparklineData.max)}
                </span>
                {percentChange ? <span>{percentChange} vs prev.</span> : null}
              </div>
            </>
          ) : (
            <span className="snapshot-card__delta snapshot-card__delta--muted">
              More history needed for trend
            </span>
          )}
        </article>
      </div>
      <dl className="snapshot-meta">
        <div>
          <dt>Embedding Model</dt>
          <dd>{embeddingLabel}</dd>
        </div>
        <div>
          <dt>Ingestion Mode</dt>
          <dd>{latest.ingestionMode ?? "—"}</dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>
            {latest.capturedAt ? (
              <ClientSideDate value={latest.capturedAt} />
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Source Run</dt>
          <dd>
            {latest.runId ? (
              <code className="snapshot-run-id">{latest.runId}</code>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Schema Version</dt>
          <dd>{latest.schemaVersion ?? "—"}</dd>
        </div>
      </dl>

      <section className="snapshot-history">
        <header className="snapshot-history__header">
          <h3 className="heading-with-icon">
            <FiClock aria-hidden="true" />
            Recent Snapshots <span>({historyList.length})</span>
          </h3>
          <p>Comparing the most recent {historyList.length} captures.</p>
        </header>
        <ul className="snapshot-history__list">
          {historyList.map((entry, index) => (
            <li key={entry.id} className="snapshot-history__item">
              <div className="snapshot-history__row">
                <div>
                  <span className="snapshot-history__timestamp">
                    {entry.capturedAt ? (
                      <ClientSideDate value={entry.capturedAt} />
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="snapshot-history__provider">
                    {formatEmbeddingSpaceLabel(entry.embeddingSpaceId)}
                  </span>
                </div>
                <div className="snapshot-history__stats">
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
                <span className="snapshot-history__badge">Latest</span>
              ) : (
                <span className="snapshot-history__badge snapshot-history__badge--muted">
                  #{index + 1}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
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
    <section className="admin-card admin-section system-health">
      <header className="admin-section__header">
        <h2 className="heading-with-icon">
          <FiActivity aria-hidden="true" />
          System Health
        </h2>
        <p className="admin-section__description">
          Operational signals from the latest ingestion run and queue state.
        </p>
      </header>
      <div className="health-grid">
        <article className="health-card">
          <span className="health-card__label">Last Run</span>
          <span
            className={`health-status-pill health-status-pill--${health.status}`}
          >
            {statusLabel}
          </span>
          <div className="health-card__meta">
            {health.runId ? (
              <>
                <div>
                  Run ID:{" "}
                  <code className="snapshot-run-id">{health.runId}</code>
                </div>
                <div>
                  Updated:{" "}
                  {runTimestamp ? <ClientSideDate value={runTimestamp} /> : "—"}
                </div>
                {health.snapshotCapturedAt ? (
                  <div>
                    Snapshot:{" "}
                    <ClientSideDate value={health.snapshotCapturedAt} />
                  </div>
                ) : null}
              </>
            ) : (
              <div>No runs recorded yet.</div>
            )}
          </div>
        </article>
        <article className="health-card">
          <span className="health-card__label">Duration</span>
          <span className="health-card__value">
            {formatDuration(health.durationMs)}
          </span>
          <div className="health-card__meta">
            {health.startedAt ? (
              <>
                <div>Started:</div>
                <div>
                  <ClientSideDate value={health.startedAt} />
                </div>
              </>
            ) : (
              <div>—</div>
            )}
          </div>
        </article>
        <article className="health-card">
          <span className="health-card__label">Data Quality</span>
          <div className="health-card__stack">
            <div>Errors: {numberFormatter.format(health.errorCount ?? 0)}</div>
            <div>
              Skipped Docs:{" "}
              {numberFormatter.format(health.documentsSkipped ?? 0)}
            </div>
          </div>
          <div className="health-card__meta">
            Derived from the latest recorded run.
          </div>
        </article>
        <article className="health-card">
          <span className="health-card__label">Queue Health</span>
          <div className="health-card__stack">
            <div>Queue Depth: {health.queueDepth ?? "—"}</div>
            <div>Pending Runs: {health.pendingRuns ?? "—"}</div>
            <div>Retry Count: {health.retryCount ?? "—"}</div>
          </div>
          <div className="health-card__meta">
            Values are captured when the snapshot was recorded.
          </div>
        </article>
        <article className="health-card">
          <span className="health-card__label">Last Failure</span>
          {health.lastFailureRunId ? (
            <>
              <div className="health-card__value">
                {health.lastFailureStatus
                  ? getStatusLabel(health.lastFailureStatus)
                  : "Failed"}
              </div>
              <div className="health-card__meta">
                <div>
                  Run ID:{" "}
                  <code className="snapshot-run-id">
                    {health.lastFailureRunId}
                  </code>
                </div>
                <div>
                  At:{" "}
                  {lastFailureTimestamp ? (
                    <ClientSideDate value={lastFailureTimestamp} />
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="health-card__meta">No failures recorded.</div>
          )}
        </article>
      </div>
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
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextStatus = event.target.value as
        | RunStatus
        | typeof ALL_FILTER_VALUE;
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
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextType = event.target.value as
        | IngestionType
        | typeof ALL_FILTER_VALUE;
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
    (event: ChangeEvent<HTMLSelectElement>) => {
      const rawValue = event.target.value;
      const nextSource =
        rawValue === ALL_FILTER_VALUE ? ALL_FILTER_VALUE : rawValue;
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
    (event: ChangeEvent<HTMLSelectElement>) => {
      const rawValue = event.target.value;
      const resolved =
        rawValue === ALL_FILTER_VALUE
          ? ALL_FILTER_VALUE
          : rawValue;
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

  return (
    <section className="admin-card admin-section">
      <header className="admin-section__header">
        <h2 className="heading-with-icon">
          <FiLayers aria-hidden="true" />
          Recent Runs
        </h2>
        <p className="admin-section__description">
          Latest ingestion activity from manual and scheduled jobs.
        </p>
      </header>
      <div className="recent-runs__toolbar">
        <div className="recent-runs__filters">
          <label className="recent-runs__filter">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={handleStatusChange}
              aria-label="Filter runs by status"
            >
              <option value={ALL_FILTER_VALUE}>All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {getStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="recent-runs__filter">
            <span>Type</span>
            <select
              value={ingestionTypeFilter}
              onChange={handleIngestionTypeChange}
              aria-label="Filter runs by ingestion type"
            >
              <option value={ALL_FILTER_VALUE}>All types</option>
              {ingestionTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {getIngestionTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="recent-runs__filter">
            <span>Source</span>
            <select
              value={sourceFilter}
              onChange={handleSourceChange}
              aria-label="Filter runs by source"
            >
              <option value={ALL_FILTER_VALUE}>All sources</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label className="recent-runs__filter">
            <span>Embedding model</span>
            <select
              value={embeddingProviderFilter}
              onChange={handleEmbeddingProviderChange}
              aria-label="Filter runs by embedding model"
            >
              <option value={ALL_FILTER_VALUE}>All models</option>
              {embeddingProviderOptions.map((provider) => (
                <option key={provider} value={provider}>
                  {getEmbeddingFilterLabel(provider)}
                </option>
              ))}
            </select>
          </label>
          <label className="recent-runs__filter">
            <span>Started After</span>
            <input
              type="date"
              value={startedFromFilter}
              max={
                startedToFilter && startedToFilter.length > 0
                  ? startedToFilter
                  : undefined
              }
              onChange={handleStartedFromChange}
            />
          </label>
          <label className="recent-runs__filter">
            <span>Started Before</span>
            <input
              type="date"
              value={startedToFilter}
              min={
                startedFromFilter && startedFromFilter.length > 0
                  ? startedFromFilter
                  : undefined
              }
              onChange={handleStartedToChange}
            />
          </label>
        </div>
        <div className="recent-runs__actions">
          <div className="recent-runs__checkbox-filter">
            <Checkbox
              className="recent-runs__checkbox-control"
              checked={hideSkipped}
              onCheckedChange={handleHideSkippedChange}
              disabled={isLoading}
              aria-label="Hide skipped runs"
            />
            <span>Hide skipped runs</span>
          </div>

          <button
            type="button"
            onClick={handleResetFilters}
            disabled={!canReset}
            className="recent-runs__reset"
          >
            Reset view
          </button>
        </div>
      </div>
      {error ? (
        <div className="admin-table__error" role="alert">
          {error}
        </div>
      ) : null}
      <div
        className={`admin-table${isLoading ? " admin-table--loading" : ""}`}
        aria-busy={isLoading}
      >
        <table className="admin-table__grid">
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Type</th>
              <th>Embedding Model</th>
              <th>Duration</th>
              <th>Chunks</th>
              <th>Docs</th>
              <th>Data Added</th>
              <th>Data Updated</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={11} className="admin-table__empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              runs.map((run) => {
                const errorCount = run.error_count ?? 0;
                const logs = run.error_logs ?? [];
                const rootPageId = getStringMetadata(
                  run.metadata,
                  "rootPageId",
                );
                const urlCount = getNumericMetadata(run.metadata, "urlCount");
                const publicPageUrl = getStringMetadata(
                  run.metadata,
                  "publicPageUrl",
                );
                const pageUrl =
                  publicPageUrl ??
                  getStringMetadata(run.metadata, "pageUrl");
                const pageId = getStringMetadata(run.metadata, "pageId");
                const targetUrl = getStringMetadata(run.metadata, "url");
                const hostname = getStringMetadata(run.metadata, "hostname");
                const embeddingSpaceId = getEmbeddingSpaceIdFromMetadata(
                  run.metadata,
                );
                const embeddingModelLabel =
                  embeddingSpaceId === null
                    ? "Unknown"
                    : formatEmbeddingSpaceLabel(embeddingSpaceId);
                const isFullySkipped =
                  run.status === "success" &&
                  (run.documents_processed ?? 0) > 0 &&
                  run.documents_processed === run.documents_skipped &&
                  (run.chunks_added ?? 0) === 0 &&
                  (run.chunks_updated ?? 0) === 0;
                const isDeleting = deletingRunIds[run.id] === true;

                const displayStatus = isFullySkipped ? "skipped" : run.status;
                const displayStatusLabel = isFullySkipped
                  ? "Skipped"
                  : run.status.replaceAll("_", " ");

                return (
                  <tr key={run.id}>
                    <td>
                      <ClientSideDate value={run.started_at} />
                    </td>
                    <td>
                      <span
                        className={`status-pill status-pill--${displayStatus}`}
                      >
                        {displayStatusLabel}
                      </span>
                      {errorCount > 0 && (
                        <details className="admin-issues">
                          <summary>{errorCount} issue(s)</summary>
                          <ul>
                            {logs.slice(0, 5).map((log, index) => (
                              <li key={index}>
                                {log.doc_id ? (
                                  <strong>{log.doc_id}: </strong>
                                ) : null}
                                {log.context ? (
                                  <span>{log.context}: </span>
                                ) : null}
                                {log.message}
                              </li>
                            ))}
                            {logs.length > 5 ? (
                              <li>{`${logs.length - 5} more`}</li>
                            ) : null}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td>
                      <span className="badge">
                        {run.ingestion_type === "full" ? "Full" : "Partial"}
                      </span>
                      {run.partial_reason ? (
                        <div className="admin-table__meta">
                          {run.partial_reason}
                        </div>
                      ) : null}
                    </td>
                    <td>{embeddingModelLabel}</td>
                    <td>{formatDuration(run.duration_ms ?? 0)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div>
                        Added: {numberFormatter.format(run.chunks_added ?? 0)}
                      </div>
                      <div>
                        Updated:{" "}
                        {numberFormatter.format(run.chunks_updated ?? 0)}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div>
                        Added:{" "}
                        {numberFormatter.format(run.documents_added ?? 0)}
                      </div>
                      <div>
                        Updated:{" "}
                        {numberFormatter.format(run.documents_updated ?? 0)}
                      </div>
                      <div>
                        Skipped:{" "}
                        {numberFormatter.format(run.documents_skipped ?? 0)}
                      </div>
                    </td>
                    <td>{formatCharacters(run.characters_added ?? 0)}</td>
                    <td>{formatCharacters(run.characters_updated ?? 0)}</td>
                    <td>
                      {rootPageId ? (
                        <div className="admin-table__meta">
                          Root: {rootPageId}
                        </div>
                      ) : null}
                      {pageId ? (
                        <div className="admin-table__meta">
                          Page ID: {pageId}
                        </div>
                      ) : null}
                      {pageUrl ? (
                        <div className="admin-table__meta">
                          Page:{" "}
                          <a href={pageUrl} target="_blank" rel="noreferrer">
                            {pageUrl}
                          </a>
                        </div>
                      ) : null}
                      {targetUrl ? (
                        <div className="admin-table__meta">
                          URL:{" "}
                          <a href={targetUrl} target="_blank" rel="noreferrer">
                            {targetUrl}
                          </a>
                        </div>
                      ) : null}
                      {hostname ? (
                        <div className="admin-table__meta">
                          Host: {hostname}
                        </div>
                      ) : null}
                      {urlCount !== null ? (
                        <div className="admin-table__meta">
                          URLs: {numberFormatter.format(urlCount)}
                        </div>
                      ) : null}
                      {run.ended_at ? (
                        <div className="admin-table__meta">
                          Finished: <ClientSideDate value={run.ended_at} />
                        </div>
                      ) : null}
                      {!rootPageId &&
                      !pageId &&
                      !pageUrl &&
                      !targetUrl &&
                      !hostname && // Check if any meta info exists
                      urlCount === null &&
                      !run.ended_at ? (
                        <div className="admin-table__meta">—</div>
                      ) : null}
                    </td>
                    <td className="admin-table__actions">
                      <button
                        type="button"
                        className="admin-table__delete-button"
                        onClick={() => {
                          void handleDeleteRun(run);
                        }}
                        disabled={isDeleting}
                        aria-label={`Delete ingestion run ${run.id}`}
                      >
                        {isDeleting ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="recent-runs__footer">
          <div className="recent-runs__summary">{summaryText}</div>
          <div className="recent-runs__pagination">
            <button
              type="button"
              onClick={handlePreviousPage}
              disabled={page <= 1 || isLoading || totalCount === 0}
              className="recent-runs__page-button"
            >
              Previous
            </button>
            <span className="recent-runs__page-indicator">
              Page {numberFormatter.format(page)} of{" "}
              {numberFormatter.format(totalPagesSafe)}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={
                page >= totalPagesSafe ||
                runs.length === 0 ||
                isLoading ||
                totalCount === 0
              }
              className="recent-runs__page-button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
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
        <header className="admin-hero">
          <div className="admin-hero__body">
            <h1>Ingestion Dashboard</h1>
            <p>
              Monitor ingestion health, trigger manual runs, and review the
              latest dataset snapshot.
            </p>
          </div>
          <Link href="/admin/chat-config" className="admin-hero__cta">
            Chat Configuration
          </Link>
        </header>

        <div className="admin-stack">
          <ManualIngestionPanel />

          <DatasetSnapshotSection overview={datasetSnapshot} />
          <SystemHealthSection health={systemHealth} />

          <RecentRunsSection initial={recentRuns} />
        </div>
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
      (entry: SnapshotRecord | null): entry is SnapshotRecord =>
        entry !== null,
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
