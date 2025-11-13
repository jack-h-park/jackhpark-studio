import type { GetServerSideProps } from "next";
import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiFileText } from "@react-icons/all-files/fi/FiFileText";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiLink } from "@react-icons/all-files/fi/FiLink";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ExtendedRecordMap, type PageBlock } from "notion-types";
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
import { NotionContextProvider } from "react-notion-x";
import css from "styled-jsx/css";

import {
  MODEL_PROVIDER_LABELS,
  MODEL_PROVIDERS,
  type ModelProvider,
  normalizeModelProvider,
  toModelProviderId,
} from "@/lib/shared/model-provider";

import type { ManualIngestionRequest } from "../../lib/admin/manual-ingestor";
import { Footer } from "../../components/Footer";
import { NotionPageHeader } from "../../components/NotionPageHeader";
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

type SnapshotSummary = {
  id: string;
  capturedAt: string | null;
  provider: ModelProvider;
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

const ADMIN_PAGE_ID = "admin-ingestion";
const ADMIN_PAGE_BLOCK: PageBlock = {
  id: ADMIN_PAGE_ID,
  type: "page",
  parent_id: "admin-root",
  parent_table: "space",
  alive: true,
  created_time: 0,
  last_edited_time: 0,
  created_by_table: "notion_user",
  created_by_id: "admin",
  last_edited_by_table: "notion_user",
  last_edited_by_id: "admin",
  space_id: "admin-space",
  version: 1,
  properties: {
    title: [["Ingestion Dashboard"]],
  },
  format: {},
} as PageBlock;

const ADMIN_RECORD_MAP: ExtendedRecordMap = {
  block: {
    [ADMIN_PAGE_BLOCK.id]: {
      role: "reader",
      value: ADMIN_PAGE_BLOCK,
    },
  },
  collection: {},
  collection_query: {},
  collection_view: {},
  notion_user: {},
  space: {},
  space_view: {},
  user_root: {},
  user_settings: {},
  discussion: {},
  discussion_comment: {},
  signed_urls: {},
} as ExtendedRecordMap;

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

const DEFAULT_MANUAL_EMBEDDING_PROVIDER: ModelProvider = normalizeModelProvider(
  process.env.NEXT_PUBLIC_LLM_PROVIDER ?? null,
  "openai",
);

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

function parseEmbeddingProviderQueryValue(
  value: string | string[] | undefined,
): ModelProvider | typeof ALL_FILTER_VALUE {
  const extracted = extractQueryValue(value);
  if (!extracted) {
    return ALL_FILTER_VALUE;
  }
  const normalized = toModelProviderId(extracted);
  return normalized ?? ALL_FILTER_VALUE;
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

function collectSources(runs: RunRecord[]): string[] {
  const sourceSet = new Set<string>();
  for (const run of runs) {
    if (typeof run.source === "string" && run.source.length > 0) {
      sourceSet.add(run.source);
    }
  }
  return Array.from(sourceSet).toSorted((a, b) => a.localeCompare(b));
}

function collectEmbeddingProviders(runs: RunRecord[]): ModelProvider[] {
  const providerSet = new Set<ModelProvider>();
  for (const run of runs) {
    const raw = getStringMetadata(run.metadata, "embeddingProvider");
    const provider = toModelProviderId(raw);
    if (provider) {
      providerSet.add(provider);
    }
  }
  return Array.from(providerSet).toSorted((a, b) => a.localeCompare(b));
}

function mergeEmbeddingProviders(
  existing: ModelProvider[],
  runs: RunRecord[],
): ModelProvider[] {
  const providers = new Set(existing);
  for (const run of runs) {
    const raw = getStringMetadata(run.metadata, "embeddingProvider");
    const provider = toModelProviderId(raw);
    if (provider) {
      providers.add(provider);
    }
  }
  return Array.from(providers).toSorted((a, b) => a.localeCompare(b));
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
    provider: snapshot.embeddingProvider,
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
  const [manualEmbeddingProvider, setManualEmbeddingProvider] =
    useState<ModelProvider>(DEFAULT_MANUAL_EMBEDDING_PROVIDER);
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
    const stored = localStorage.getItem("manual_embedding_provider");
    if (stored) {
      setManualEmbeddingProvider(
        normalizeModelProvider(stored, DEFAULT_MANUAL_EMBEDDING_PROVIDER),
      );
    }
  }, []);

  const setEmbeddingProviderAndSave = useCallback((next: ModelProvider) => {
    setManualEmbeddingProvider(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("manual_embedding_provider", next);
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
        embeddingProvider: manualEmbeddingProvider,
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
        embeddingProvider: manualEmbeddingProvider,
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
      {/*
        This style block is necessary for styled-jsx to apply styles to this component,
        as it's defined separately from the main page component where the styles are declared.
      */}
      <style jsx>{styles}</style>
      <section className="manual-ingestion admin-card">
        <header className="manual-ingestion__header">
          <div>
            <h2>Manual Ingestion</h2>
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
                  Embedding provider
                </label>
                <select
                  id="manual-provider-select"
                  value={manualEmbeddingProvider}
                  onChange={(event) =>
                    setEmbeddingProviderAndSave(
                      normalizeModelProvider(
                        event.target.value,
                        manualEmbeddingProvider,
                      ),
                    )
                  }
                  disabled={isRunning}
                >
                  {MODEL_PROVIDERS.map((option) => (
                    <option key={option} value={option}>
                      {MODEL_PROVIDER_LABELS[option]}
                    </option>
                  ))}
                </select>
                <p className="manual-field__hint">
                  Determines which embedding service powers this run.
                </p>
              </div>

              {mode === "notion_page" ? (
                <div className="manual-toggle">
                  <input
                    id="manual-linked-pages"
                    type="checkbox"
                    checked={includeLinkedPages}
                    onChange={(event) =>
                      setIncludeLinkedPages(event.target.checked)
                    }
                    disabled={isRunning}
                    aria-describedby="manual-linked-pages-hint"
                  />
                  <div className="manual-toggle__content">
                    <label
                      className="manual-toggle__label"
                      htmlFor="manual-linked-pages"
                    >
                      Include linked pages
                    </label>
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
              <h3>Run Log</h3>
              <span className="manual-logs__meta">
                {logs.length === 0
                  ? "Awaiting events"
                  : `${logs.length} entr${logs.length === 1 ? "y" : "ies"}`}
              </span>
            </div>
            <label className="manual-logs__autoscroll">
              <input
                type="checkbox"
                checked={autoScrollLogs}
                onChange={(event) =>
                  handleToggleAutoScroll(event.target.checked)
                }
              />
              <span>Auto-scroll to latest</span>
            </label>
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
            <h3>Run Summary</h3>
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
  const providerLabel =
    latest && (MODEL_PROVIDER_LABELS[latest.provider] ?? latest.provider);
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
        <h2>Dataset Snapshot</h2>
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
          <dt>Embedding Provider</dt>
          <dd>{providerLabel}</dd>
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
          <h3>
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
                    {MODEL_PROVIDER_LABELS[entry.provider] ?? entry.provider}
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
        <h2>System Health</h2>
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
    ModelProvider | typeof ALL_FILTER_VALUE
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
    ModelProvider[]
  >(() => collectEmbeddingProviders(initial.runs));
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
      embeddingProvider: ModelProvider | typeof ALL_FILTER_VALUE;
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
      if (next.embeddingProvider !== ALL_FILTER_VALUE) {
        preserved.embeddingProvider = next.embeddingProvider;
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
    const nextEmbeddingProvider = parseEmbeddingProviderQueryValue(
      router.query.embeddingProvider,
    );
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
      params.append("embeddingProvider", embeddingProviderFilter);
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
            embeddingProvider: embeddingProviderFilter,
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
          mergeEmbeddingProviders(current, payload.runs),
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
        embeddingProvider: embeddingProviderFilter,
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
        embeddingProvider: embeddingProviderFilter,
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
        embeddingProvider: embeddingProviderFilter,
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
          : (toModelProviderId(rawValue) ?? ALL_FILTER_VALUE);
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
        embeddingProvider: resolved,
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
        embeddingProvider: embeddingProviderFilter,
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
        embeddingProvider: embeddingProviderFilter,
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
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextHideSkipped = event.target.checked;
      setHideSkipped(nextHideSkipped);
      updateQuery({
        page,
        status: statusFilter,
        ingestionType: ingestionTypeFilter,
        source: sourceFilter,
        embeddingProvider: embeddingProviderFilter,
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
      embeddingProvider: ALL_FILTER_VALUE,
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
        embeddingProvider: embeddingProviderFilter,
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
        <h2>Recent Runs</h2>
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
            <span>Embedding</span>
            <select
              value={embeddingProviderFilter}
              onChange={handleEmbeddingProviderChange}
              aria-label="Filter runs by embedding provider"
            >
              <option value={ALL_FILTER_VALUE}>All providers</option>
              {embeddingProviderOptions.map((provider) => (
                <option key={provider} value={provider}>
                  {MODEL_PROVIDER_LABELS[provider] ?? provider}
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
          <label className="recent-runs__checkbox-filter">
            <input
              type="checkbox"
              checked={hideSkipped}
              onChange={handleHideSkippedChange}
              disabled={isLoading}
            />
            <span>Hide skipped runs</span>
          </label>

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
              <th>Embedding</th>
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
                const pageUrl = getStringMetadata(run.metadata, "pageUrl");
                const pageId = getStringMetadata(run.metadata, "pageId");
                const targetUrl = getStringMetadata(run.metadata, "url");
                const hostname = getStringMetadata(run.metadata, "hostname");
                const embeddingProviderValue = getStringMetadata(
                  run.metadata,
                  "embeddingProvider",
                );
                const embeddingProviderId = toModelProviderId(
                  embeddingProviderValue,
                );
                const embeddingProviderLabel = embeddingProviderId
                  ? MODEL_PROVIDER_LABELS[embeddingProviderId]
                  : (embeddingProviderValue ?? "—");
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
                    <td>{embeddingProviderLabel}</td>
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
}: PageProps): JSX.Element {
  return (
    <>
      <Head>
        <title>Ingestion Dashboard</title>
      </Head>

      <div className="admin-ingestion-page notion">
        <div className="admin-header-shell">
          <NotionContextProvider
            recordMap={ADMIN_RECORD_MAP}
            fullPage
            darkMode={false}
            previewImages={false}
            forceCustomImages={false}
            showCollectionViewDropdown={false}
            showTableOfContents={false}
            minTableOfContentsItems={0}
            linkTableTitleProperties={false}
            isLinkCollectionToUrlProperty={false}
            mapPageUrl={(pageId: string) => `/${pageId}`}
            mapImageUrl={() => undefined}
          >
            <NotionPageHeader block={ADMIN_PAGE_BLOCK} />
          </NotionContextProvider>
        </div>

        <main className="notion-page-content admin-ingestion-content">
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
        </main>

        <div className="admin-footer-shell">
          <Footer />
        </div>
      </div>

      <style jsx>{styles}</style>
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

const styles = css.global`
  .admin-ingestion-page {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    /* Use a slightly darker background for better contrast with dense elements */
    background: var(--bg-color, #f9f8f6);
    --notion-max-width: 1320px;
  }

  .admin-header-shell,
  .admin-footer-shell {
    width: 100%;
    display: flex;
    justify-content: center;
    background: transparent;
  }

  .admin-header-shell {
    padding: 0 clamp(28px, 6vw, 96px);
    box-sizing: border-box;
  }

  .admin-header-shell :global(.notion-header) {
    width: min(100%, 1320px);
    margin: 0 auto;
  }

  .admin-header-shell :global(.notion-nav-header) {
    width: 100%;
    padding: 0 clamp(4px, 1vw, 12px);
  }

  .admin-header-shell :global(.notion-nav-header-rhs) {
    justify-content: flex-end;
  }

  .admin-footer-shell {
    padding: 0 clamp(28px, 6vw, 96px);
    box-sizing: border-box;
  }

  .admin-footer-shell :global(footer) {
    width: min(100%, 1320px);
    margin: 3rem auto 0;
    padding: 25px clamp(0.5rem, 2vw, 1.75rem);
    box-sizing: border-box;
  }

  .admin-ingestion-content {
    width: min(100%, 1320px);
    max-width: 1320px;
    margin: 0 auto;
    /* Reduced overall padding for a denser layout */
    padding: clamp(2.5rem, 5vw, 4rem) clamp(1.5rem, 3vw, 2.5rem) 4.5rem;
    color: var(--fg-color, rgba(55, 53, 47, 0.95));
    line-height: 1.6;
  }

  .admin-hero {
    margin-bottom: 2rem; /* Reduced bottom margin */
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.5rem;
  }

  .admin-hero__body {
    flex: 1;
    min-width: 16rem;
  }

  .admin-hero h1 {
    margin: 0;
    font-size: 2.35rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--fg-color, rgba(55, 53, 47, 0.98));
  }

  .admin-hero p {
    margin: 0.75rem 0 0;
    max-width: 48rem;
    font-size: 1.05rem;
    color: rgba(55, 53, 47, 0.6);
  }

  .admin-hero__cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: fit-content;
    padding: 0.65rem 1.15rem;
    border-radius: 12px;
    border: 1px solid rgba(37, 99, 235, 0.28);
    background: rgba(37, 99, 235, 0.12);
    color: rgba(37, 41, 78, 0.92);
    font-weight: 600;
    font-size: 0.95rem;
    text-decoration: none;
    box-shadow: 0 18px 40px -30px rgba(37, 99, 235, 0.9);
    transition:
      background 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;
  }

  .admin-hero__cta:hover,
  .admin-hero__cta:focus {
    background: rgba(37, 99, 235, 0.2);
    box-shadow: 0 20px 42px -30px rgba(37, 99, 235, 0.95);
    transform: translateY(-1px);
  }

  .admin-stack {
    display: flex;
    flex-direction: column;
    /* Reduced gap between stacked cards */
    gap: clamp(1.5rem, 2.5vw, 2rem);
  }

  .admin-card {
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid rgba(55, 53, 47, 0.16);
    border-radius: 18px;
    /* Reduced padding inside cards */
    padding: 1.8rem 2rem;
    box-shadow: 0 26px 60px -36px rgba(15, 15, 15, 0.28);
    backdrop-filter: blur(10px);
  }

  .admin-section__header {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    /* Reduced bottom margin for section headers */
    margin-bottom: 1.25rem;
  }

  .admin-section__header h2 {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 600;
    color: var(--fg-color, rgba(55, 53, 47, 0.92));
  }

  .admin-section__description {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .snapshot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.1rem;
  }

  .snapshot-card {
    border: 1px solid rgba(55, 53, 47, 0.12);
    border-radius: 14px;
    padding: 1rem 1.1rem;
    background: rgba(255, 255, 255, 0.96);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .snapshot-card__label {
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(55, 53, 47, 0.55);
  }

  .snapshot-card__value {
    font-size: 1.45rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.92);
  }

  .snapshot-card__delta {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .snapshot-card--trend {
    grid-column: span 2;
  }

  .snapshot-sparkline {
    width: 100%;
    height: 80px;
  }

  .snapshot-sparkline path {
    fill: none;
    stroke: rgba(46, 170, 220, 0.9);
    stroke-width: 2;
  }

  .snapshot-card__trend-meta {
    margin-top: 0.35rem;
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: rgba(55, 53, 47, 0.6);
  }

  .snapshot-card__delta--positive {
    color: rgba(16, 185, 129, 0.95);
  }

  .snapshot-card__delta--negative {
    color: rgba(239, 68, 68, 0.95);
  }

  .snapshot-card__delta--muted {
    color: rgba(55, 53, 47, 0.45);
  }

  .snapshot-meta {
    margin-top: 1.4rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .snapshot-meta div {
    border: 1px solid rgba(55, 53, 47, 0.1);
    border-radius: 12px;
    padding: 0.9rem 1rem;
    background: rgba(248, 248, 246, 0.9);
  }

  .snapshot-meta dt {
    margin: 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(55, 53, 47, 0.55);
  }

  .snapshot-meta dd {
    margin: 0.15rem 0 0;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.85);
  }

  .snapshot-empty {
    border: 1px dashed rgba(55, 53, 47, 0.25);
    border-radius: 14px;
    padding: 1.5rem;
    background: rgba(248, 248, 246, 0.65);
    color: rgba(55, 53, 47, 0.7);
    display: grid;
    gap: 0.35rem;
  }

  .snapshot-run-id {
    font-family: "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
    font-size: 0.82rem;
    background: rgba(55, 53, 47, 0.08);
    padding: 0.1rem 0.4rem;
    border-radius: 0.35rem;
  }

  .snapshot-history {
    margin-top: 1.5rem;
    border: 1px solid rgba(55, 53, 47, 0.1);
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    background: rgba(255, 255, 255, 0.96);
  }

  .snapshot-history__header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.85rem;
  }

  .snapshot-history__header h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.92);
  }

  .snapshot-history__header h3 span {
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.55);
    margin-left: 0.4rem;
  }

  .snapshot-history__header p {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.6);
  }

  .snapshot-history__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.7rem;
  }

  .snapshot-history__item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid rgba(55, 53, 47, 0.08);
  }

  .snapshot-history__item:last-child {
    border-bottom: none;
  }

  .snapshot-history__row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .snapshot-history__timestamp {
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.8);
  }

  .snapshot-history__provider {
    font-size: 0.8rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .snapshot-history__stats {
    display: flex;
    gap: 0.6rem;
    font-size: 0.8rem;
    color: rgba(55, 53, 47, 0.65);
  }

  .snapshot-history__badge {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    background: rgba(46, 170, 220, 0.12);
    color: rgba(46, 170, 220, 0.85);
    font-weight: 600;
  }

  .snapshot-history__badge--muted {
    background: rgba(55, 53, 47, 0.08);
    color: rgba(55, 53, 47, 0.6);
  }

  .health-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.1rem;
  }

  .health-card {
    border: 1px solid rgba(55, 53, 47, 0.12);
    border-radius: 14px;
    padding: 1rem 1.1rem;
    background: rgba(255, 255, 255, 0.96);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .health-card__label {
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(55, 53, 47, 0.55);
  }

  .health-card__value {
    font-size: 1.35rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.92);
  }

  .health-card__stack {
    display: grid;
    gap: 0.2rem;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.85);
  }

  .health-card__meta {
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.55);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .health-status-pill {
    align-self: flex-start;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    font-size: 0.88rem;
    font-weight: 600;
    text-transform: capitalize;
    background: rgba(55, 53, 47, 0.08);
    color: rgba(55, 53, 47, 0.85);
  }

  .health-status-pill--success {
    background: rgba(16, 185, 129, 0.16);
    color: rgba(6, 95, 70, 0.95);
  }

  .health-status-pill--failed {
    background: rgba(239, 68, 68, 0.15);
    color: rgba(153, 27, 27, 0.95);
  }

  .health-status-pill--completed_with_errors {
    background: rgba(249, 115, 22, 0.15);
    color: rgba(154, 52, 18, 0.95);
  }

  .health-status-pill--in_progress {
    background: rgba(59, 130, 246, 0.18);
    color: rgba(37, 99, 235, 0.95);
  }

  .health-status-pill--unknown {
    background: rgba(55, 53, 47, 0.12);
    color: rgba(55, 53, 47, 0.75);
  }

  .recent-runs__toolbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem;
    /* Reduced bottom margin for the toolbar */
    margin-bottom: 0.8rem;
  }

  .recent-runs__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-end;
  }

  .recent-runs__filter {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 140px;
  }

  .recent-runs__filter span {
    font-size: 0.8rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .recent-runs__filter select,
  .recent-runs__filter input {
    /* Reduced padding for filter controls */
    padding: 0.4rem 0.6rem;
    border-radius: 8px;
    border: 1px solid rgba(55, 53, 47, 0.18);
    font-size: 0.9rem;
    background: #fff;
    color: rgba(55, 53, 47, 0.9);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .recent-runs__filter select:focus,
  .recent-runs__filter input:focus {
    outline: none;
    border-color: rgba(46, 170, 220, 0.7);
    box-shadow: 0 0 0 3px rgba(46, 170, 220, 0.18);
  }

  .recent-runs__actions {
    display: flex;
    align-items: flex-end;
  }

  .recent-runs__checkbox-filter {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.75);
    cursor: pointer;
    padding: 0.45rem 0.5rem;
    user-select: none;
  }

  .recent-runs__checkbox-filter input {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  .recent-runs__checkbox-filter input:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .recent-runs__reset {
    /* Reduced padding for reset button */
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    border: 1px solid rgba(55, 53, 47, 0.18);
    background: rgba(55, 53, 47, 0.05);
    color: rgba(55, 53, 47, 0.75);
    font-size: 0.9rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .recent-runs__reset:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .recent-runs__reset:not(:disabled):hover,
  .recent-runs__reset:not(:disabled):focus {
    background: rgba(46, 170, 220, 0.1);
    border-color: rgba(46, 170, 220, 0.5);
    color: rgba(46, 170, 220, 0.95);
  }

  .admin-table__error {
    margin-bottom: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    background: rgba(248, 113, 113, 0.16);
    color: rgba(153, 27, 27, 0.95);
    font-size: 0.92rem;
  }

  .admin-table {
    border: 1px solid rgba(55, 53, 47, 0.14);
    border-radius: 16px;
    overflow-x: auto;
    background: rgba(255, 255, 255, 0.95);
    position: relative;
  }

  .admin-table--loading::after {
    content: "Loading…";
    position: absolute;
    top: 12px;
    right: 18px;
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.45);
  }

  .admin-table__grid {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    min-width: 720px;
  }

  .admin-table__grid thead th {
    background: rgba(55, 53, 47, 0.06);
    text-align: left;
    /* Further reduced padding for a denser table header */
    padding: 0.5rem 1rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(55, 53, 47, 0.6);
  }

  .admin-table__grid tbody td {
    /* Further reduced padding and line-height for denser table cells */
    padding: 0.5rem 1rem;
    border-top: 1px solid rgba(55, 53, 47, 0.08);
    vertical-align: top;
    font-size: 0.9rem;
    line-height: 1.4;
    color: rgba(55, 53, 47, 0.85);
  }

  .admin-table__grid tbody tr:first-child td {
    border-top: none;
  }

  /* Add a subtle hover effect */
  .admin-table__grid tbody tr:hover {
    background: rgba(46, 170, 220, 0.08);
  }

  .admin-table__empty {
    text-align: center;
    padding: 2.4rem 1rem;
    color: rgba(55, 53, 47, 0.55);
    font-size: 0.95rem;
  }

  .admin-table__meta {
    /* Further reduced margin for meta text in cells */
    margin-top: 0.2rem;
    font-size: 0.82rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .admin-table__meta a {
    color: rgba(46, 170, 220, 0.85);
    text-decoration: none;
  }

  .admin-table__meta a:hover,
  .admin-table__meta a:focus {
    text-decoration: underline;
  }

  .admin-table__actions {
    white-space: nowrap;
  }

  .admin-table__delete-button {
    padding: 0.35rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
    color: rgba(185, 28, 28, 0.95);
    font-size: 0.85rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .admin-table__delete-button:hover,
  .admin-table__delete-button:focus {
    background: rgba(239, 68, 68, 0.18);
    border-color: rgba(239, 68, 68, 0.6);
    outline: none;
  }

  .admin-table__delete-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .admin-issues {
    /* Reduced top margin for issue details */
    margin-top: 0.3rem;
  }

  .admin-issues summary {
    cursor: pointer;
    color: rgba(46, 170, 220, 0.85);
    font-size: 0.85rem;
  }

  .admin-issues ul {
    margin: 0.4rem 0 0;
    padding-left: 1.25rem;
    color: rgba(55, 53, 47, 0.7);
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.85rem;
    border-radius: 16px;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .status-pill--success {
    background: rgba(16, 185, 129, 0.16);
    color: rgba(6, 95, 70, 0.95);
  }

  .status-pill--completed_with_errors {
    background: rgba(234, 179, 8, 0.18);
    color: rgba(133, 77, 14, 0.95);
  }

  .status-pill--failed {
    background: rgba(248, 113, 113, 0.2);
    color: rgba(153, 27, 27, 0.95);
  }

  .status-pill--in_progress {
    background: rgba(96, 165, 250, 0.2);
    color: rgba(30, 64, 175, 0.95);
  }

  .status-pill--skipped {
    background: rgba(55, 53, 47, 0.1);
    color: rgba(55, 53, 47, 0.7);
    text-transform: none;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: rgba(55, 53, 47, 0.08);
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.75);
  }

  .recent-runs__footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    /* Reduced padding in table footer */
    padding: 0.7rem 1rem;
    border-top: 1px solid rgba(55, 53, 47, 0.08);
  }

  .recent-runs__summary {
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.7);
  }

  .recent-runs__pagination {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .recent-runs__page-button {
    /* Reduced padding for pagination buttons */
    padding: 0.4rem 0.8rem;
    border-radius: 8px;
    border: 1px solid rgba(55, 53, 47, 0.18);
    background: rgba(255, 255, 255, 0.92);
    font-size: 0.88rem;
    color: rgba(55, 53, 47, 0.78);
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .recent-runs__page-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .recent-runs__page-button:not(:disabled):hover,
  .recent-runs__page-button:not(:disabled):focus {
    background: rgba(46, 170, 220, 0.1);
    border-color: rgba(46, 170, 220, 0.5);
    color: rgba(46, 170, 220, 0.95);
  }

  .recent-runs__page-indicator {
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.7);
  }

  @media (max-width: 960px) {
    .recent-runs__toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .recent-runs__actions {
      justify-content: flex-end;
    }
  }

  .manual-ingestion {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .manual-ingestion__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .manual-ingestion__header h2 {
    margin: 0;
    font-size: 1.55rem;
    font-weight: 600;
    color: var(--fg-color, rgba(55, 53, 47, 0.94));
  }

  .manual-ingestion__header p {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.6);
    max-width: 38rem;
  }

  .manual-ingestion__status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .status-pill__meta {
    font-size: 0.85rem;
  }

  .manual-ingestion__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.75rem;
  }

  .manual-ingestion__primary {
    display: grid;
    gap: 1.5rem;
    border: 1px solid rgba(55, 53, 47, 0.16); /* New */
    border-radius: 14px; /* New */
  }

  .manual-ingestion__tabs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    border-radius: 14px;
    border: 1px solid rgba(55, 53, 47, 0.16);
    background: transparent; /* Changed */
    overflow: visible; /* Changed */
    border: none; /* Changed */
    border-bottom: 1px solid rgba(55, 53, 47, 0.16); /* New */
    border-radius: 0; /* New */
    padding: 0 1.5rem; /* New */
  }

  .manual-tab {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 1rem 1.2rem;
    background: transparent;
    border: none;
    text-align: left;
    font-weight: 600;
    font-size: 0.92rem;
    color: rgba(55, 53, 47, 0.55);
    cursor: pointer;
    transition:
      color 0.2s ease,
      border-color 0.2s ease; /* Changed */
    border-bottom: 2px solid transparent; /* New */
  }

  .manual-tab__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: rgba(46, 170, 220, 0.12);
    color: rgba(46, 170, 220, 0.95);
  }

  .manual-tab__subtitle {
    display: block;
    font-size: 0.8rem;
    font-weight: 500;
    opacity: 0.75;
  }

  .manual-tab--active {
    color: rgba(55, 53, 47, 0.92);
    border-bottom-color: #2ea8dc; /* Changed */
  }

  .manual-tab:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .manual-tab:not(.manual-tab--active):hover:not(:disabled) {
    color: rgba(55, 53, 47, 0.75); /* New */
  }

  .manual-form {
    display: grid;
    gap: 1.15rem;
    padding: 1.5rem; /* New */
  }

  .manual-field {
    display: grid;
    gap: 0.45rem;
  }

  .manual-field label {
    font-weight: 600;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.68);
  }

  .manual-field input,
  .manual-field select {
    border: 1px solid rgba(55, 53, 47, 0.18);
    border-radius: 12px;
    padding: 0.78rem 1rem;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.9);
    background: #fff; /* Changed */
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .manual-field input:focus,
  .manual-field select:focus {
    outline: none;
    border-color: rgba(46, 170, 220, 0.65);
    box-shadow: 0 0 0 2px rgba(46, 170, 220, 0.18);
  }

  .manual-field input:disabled,
  .manual-field select:disabled {
    background: rgba(245, 244, 240, 0.7);
    color: rgba(55, 53, 47, 0.5);
  }

  .manual-field__hint {
    font-size: 0.8rem;
    color: rgba(55, 53, 47, 0.6);
  }

  .manual-scope {
    border: 1px solid rgba(55, 53, 47, 0.14);
    border-radius: 12px;
    padding: 0.9rem 1rem;
    background: rgba(55, 53, 47, 0.04);
    display: grid;
    gap: 0.75rem;
  }

  .manual-scope__label {
    font-size: 0.9rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.68);
  }

  .manual-scope__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .manual-scope__option {
    flex: 1 1 200px;
    min-width: 160px;
    border: 1px solid rgba(55, 53, 47, 0.18);
    border-radius: 12px;
    padding: 0.75rem 1rem;
    background: #fff;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background 0.15s ease;
    position: relative;
    text-align: left;
  }

  .manual-scope__option input {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }

  .manual-scope__option.is-active {
    border-color: rgba(46, 170, 220, 0.55);
    background: rgba(46, 170, 220, 0.12);
    box-shadow: 0 0 0 1px rgba(46, 170, 220, 0.25);
  }

  .manual-scope__option.is-disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .manual-scope__option:focus-within {
    outline: none;
    box-shadow: 0 0 0 2px rgba(46, 170, 220, 0.2);
  }

  .manual-scope__title {
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.78);
    display: block;
  }

  .manual-scope__desc {
    font-size: 0.82rem;
    color: rgba(55, 53, 47, 0.6);
    display: block;
  }

  .manual-scope__hint {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .manual-toggle {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border: 1px solid rgba(55, 53, 47, 0.18);
    border-radius: 12px;
    background: rgba(55, 53, 47, 0.04);
  }

  .manual-toggle input {
    margin-top: 0.2rem;
    width: 1.1rem;
    height: 1.1rem;
    accent-color: rgba(46, 170, 220, 0.85);
  }

  .manual-toggle input:disabled {
    cursor: not-allowed;
  }

  .manual-toggle__content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .manual-toggle__label {
    font-weight: 600;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.78);
    cursor: pointer;
  }

  .manual-toggle__hint {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.6);
    max-width: 48ch;
  }

  .manual-hint {
    margin: -0.2rem 0 0;
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .manual-error {
    font-size: 0.85rem;
    color: #b71c1c;
  }

  .manual-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    margin-top: 0.4rem;
  }

  .manual-button {
    border: 1px solid rgba(55, 53, 47, 0.18);
    background: rgba(55, 53, 47, 0.92);
    color: #fff;
    padding: 0.7rem 1.75rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease,
      background 0.15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
  }

  .manual-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 12px 26px -14px rgba(55, 53, 47, 0.55);
    background: rgba(55, 53, 47, 0.96);
  }

  .manual-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .manual-button.is-loading::after {
    content: "";
    width: 1rem;
    height: 1rem;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 999px;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .manual-progress {
    flex: 1 1 260px;
    min-width: 240px;
    display: grid;
    gap: 0.85rem;
  }

  .progress-group {
    display: grid;
    gap: 0.45rem;
  }

  .progress-group__header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
  }

  .progress-group__title {
    font-size: 0.88rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.72);
  }

  .progress-group__meta {
    font-size: 0.82rem;
    color: rgba(55, 53, 47, 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .progress-bar {
    height: 10px;
    border-radius: 999px;
    background: rgba(55, 53, 47, 0.12);
    overflow: hidden;
  }

  .progress-bar__value {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      rgba(46, 170, 220, 0.85),
      rgba(46, 170, 220, 0.55)
    );
    transition: width 0.25s ease;
  }

  .progress-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.88rem;
    color: rgba(55, 53, 47, 0.65);
  }

  .progress-message {
    color: rgba(55, 53, 47, 0.7);
  }

  .progress-id {
    font-family:
      "SFMono-Regular", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    font-size: 0.78rem;
    padding: 0.1rem 0.4rem;
    border-radius: 0.4rem;
    background: rgba(55, 53, 47, 0.08);
    color: rgba(55, 53, 47, 0.6);
  }

  .manual-ingestion__aside {
    border: 1px solid rgba(55, 53, 47, 0.12);
    border-radius: 14px;
    padding: 1.5rem 1.6rem;
    background: rgba(245, 244, 240, 0.9);
    display: grid;
    gap: 1rem;
  }

  .manual-ingestion__aside h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.82);
  }

  .manual-ingestion__aside ul {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.55rem;
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.7);
  }

  .tip-callout {
    border-radius: 12px;
    background: rgba(46, 170, 220, 0.14);
    border: 1px solid rgba(46, 170, 220, 0.3);
    padding: 0.9rem 1rem;
    display: grid;
    gap: 0.35rem;
  }

  .tip-callout strong {
    font-size: 0.82rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(46, 146, 200, 0.95);
  }

  .tip-callout p {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.68);
  }

  .manual-logs {
    margin-top: 2rem;
  }

  .manual-logs__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.85rem;
  }

  .manual-logs__title {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .manual-logs__title h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.9);
  }

  .manual-logs__meta {
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .manual-logs__autoscroll {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.82rem;
    color: rgba(55, 53, 47, 0.65);
    user-select: none;
  }

  .manual-logs__autoscroll input {
    width: 1rem;
    height: 1rem;
    accent-color: rgba(46, 170, 220, 0.85);
    margin: 0;
  }

  .manual-logs__autoscroll span {
    display: inline-block;
  }

  .manual-logs__refresh-button {
    border: 1px solid rgba(55, 53, 47, 0.18);
    background: rgba(255, 255, 255, 0.9);
    color: rgba(55, 53, 47, 0.8);
    padding: 0.35rem 0.85rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .manual-logs__refresh-button:hover {
    background: rgba(245, 244, 240, 0.9);
    border-color: rgba(55, 53, 47, 0.25);
  }

  .manual-logs__empty {
    padding: 1.1rem 0;
    text-align: center;
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .manual-logs__scroll {
    max-height: 260px;
    overflow-y: auto;
    padding-right: 0.4rem;
  }

  .manual-logs__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.8rem;
  }

  .manual-log-entry {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.8rem;
    padding: 0.8rem 1rem;
    border-radius: 12px;
    border: 1px solid rgba(55, 53, 47, 0.1);
    background: rgba(55, 53, 47, 0.05);
    font-size: 0.9rem;
  }

  .manual-log-entry--info {
    border-color: rgba(46, 170, 220, 0.2);
    background: rgba(46, 170, 220, 0.08);
  }

  .manual-log-entry--warn {
    border-color: rgba(219, 155, 28, 0.28);
    background: rgba(219, 155, 28, 0.1);
  }

  .manual-log-entry--error {
    border-color: rgba(208, 72, 72, 0.28);
    background: rgba(208, 72, 72, 0.1);
  }

  .manual-log-entry__icon {
    font-size: 1rem;
    color: inherit;
  }

  .manual-log-entry__time {
    font-family:
      "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo,
      monospace;
    font-size: 0.8rem;
    color: rgba(55, 53, 47, 0.45);
    display: block;
    margin-bottom: 0.15rem;
  }

  .manual-summary {
    margin-top: 2rem;
  }

  .manual-summary h3 {
    margin: 0 0 1.15rem;
    font-size: 1.2rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.9);
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
  }

  .summary-item {
    border: 1px solid rgba(55, 53, 47, 0.12);
    border-radius: 12px;
    padding: 0.9rem;
    background: rgba(255, 255, 255, 0.94);
    display: grid;
    gap: 0.3rem;
  }

  .summary-item dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(55, 53, 47, 0.55);
    margin: 0;
  }

  .summary-item dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.95);
  }

  .manual-refresh-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.5rem;
    padding: 1.2rem 1.8rem;
  }

  .manual-refresh-card p {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.7);
  }

  @media (min-width: 960px) {
    .manual-ingestion__layout {
      grid-template-columns: minmax(0, 2.1fr) minmax(0, 1fr);
      align-items: start;
    }
  }

  @media (max-width: 720px) {
    .admin-ingestion-content {
      padding: 3.25rem 1.2rem 4rem;
    }

    .admin-card {
      padding: 1.6rem 1.5rem;
    }

    .manual-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .manual-button {
      width: 100%;
    }

    .manual-progress {
      width: 100%;
      min-width: 0;
    }
  }
`;

export const getServerSideProps: GetServerSideProps<PageProps> = async (
  _context,
  // No changes needed here for now, filtering will be client-driven
) => {
  const supabase = getSupabaseAdminClient();
  const pageSize = DEFAULT_RUNS_PAGE_SIZE;

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
  const totalCount = runsCount ?? runs.length;
  const totalPages =
    pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const snapshotRecords: SnapshotRecord[] = (snapshotRows ?? [])
    .map((row: unknown) => normalizeSnapshotRecord(row))
    .filter((entry): entry is SnapshotRecord => entry !== null);

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
    },
  };
};

export default IngestionDashboard;
