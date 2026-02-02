import { parsePageId } from "notion-utils";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ManualEvent,
  ManualIngestionStatus,
  ManualLogEvent,
  ManualRunStats,
} from "@/lib/admin/ingestion-types";
import type { ManualIngestionRequest } from "@/lib/admin/manual-ingestor";
import {
  DEFAULT_MANUAL_EMBEDDING_SPACE_ID,
  getEmbeddingSpaceOption,
} from "@/lib/admin/recent-runs-filters";

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

function parseManualPageIds(value: string): string[] {
  const normalized = new Set<string>();
  const parts = value.split(/[\s,]+/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = parsePageId(trimmed, { uuid: true });
    if (parsed) {
      normalized.add(parsed);
    }
  }

  return Array.from(normalized);
}

export type ManualIngestionHookState = {
  mode: "notion_page" | "url";
  setMode: (mode: "notion_page" | "url") => void;
  notionInput: string;
  setNotionInput: (value: string) => void;
  urlInput: string;
  setUrlInput: (value: string) => void;
  notionScope: "partial" | "full";
  setNotionScope: (value: "partial" | "full") => void;
  ingestionScope: "selected" | "workspace";
  setIngestionScope: (value: "selected" | "workspace") => void;
  urlScope: "partial" | "full";
  setUrlScope: (value: "partial" | "full") => void;
  includeLinkedPages: boolean;
  setIncludeLinkedPages: (value: boolean) => void;
  manualEmbeddingProvider: string;
  setEmbeddingProviderAndSave: (next: string) => void;
  isRunning: boolean;
  status: ManualIngestionStatus;
  runId: string | null;
  progress: number;
  overallProgress: {
    current: number;
    total: number;
    pageId: string | null;
    title: string | null;
  };
  finalQueueSnapshot: {
    plannedTotal: number;
    processed: number;
  } | null;
  finalMessage: string | null;
  errorMessage: string | null;
  logs: ManualLogEvent[];
  stats: ManualRunStats | null;
  hasCompleted: boolean;
  autoScrollLogs: boolean;
  overallProgressRef: React.MutableRefObject<HTMLDivElement | null>;
  logsContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  handleLogsScroll: () => void;
  handleToggleAutoScroll: (checked: boolean) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setHasCompleted: (value: boolean) => void;
};

export function useManualIngestion(): ManualIngestionHookState {
  const [mode, setMode] = useState<"notion_page" | "url">("notion_page");
  const [notionInput, setNotionInput] = useState("");
  const [notionScope, setNotionScope] = useState<"partial" | "full">("partial");
  const [ingestionScope, setIngestionScope] = useState<
    "selected" | "workspace"
  >("selected");
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
  const queueProgressRef = useRef({ current: 0, total: 0 });
  const [finalQueueSnapshot, setFinalQueueSnapshot] = useState<{
    plannedTotal: number;
    processed: number;
  } | null>(null);
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
          queueProgressRef.current = {
            total: safeTotal,
            current: safeCurrent,
          };
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
        case "complete": {
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
          const progressSnapshot = queueProgressRef.current;
          setFinalQueueSnapshot({
            plannedTotal: progressSnapshot.total,
            processed: event.stats.documentsProcessed,
          });
          if (process.env.NODE_ENV !== "production") {
            const plannedTotal = progressSnapshot.total;
            const processedCount = event.stats.documentsProcessed;
            const finalTotal = Math.max(plannedTotal, processedCount);
            const finalCompleted = processedCount;
            console.debug("[manual-ingestion] completion counts", {
              plannedTotal,
              processed: processedCount,
              finalTotal,
              finalCompleted,
              updatedCount: event.stats.documentsUpdated,
              skippedCount: event.stats.documentsSkipped,
              failedCount: event.stats.errorCount,
            });
            if (plannedTotal !== processedCount) {
              console.warn(
                "[manual-ingestion] planned total (%d) != processed (%d)",
                plannedTotal,
                processedCount,
              );
            }
          }
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
        }
        default:
          break;
      }
    },
    [appendLog, scrollProgressIntoViewOnce, setFinalQueueSnapshot],
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
      const manualPageIds =
        ingestionScope === "selected" ? parseManualPageIds(notionInput) : [];
      if (ingestionScope === "selected" && manualPageIds.length === 0) {
        setErrorMessage("Enter at least one Notion page ID or URL.");
        return;
      }
      payload = {
        mode: "notion_page",
        scope: ingestionScope,
        pageId: manualPageIds[0] ?? undefined,
        pageIds:
          ingestionScope === "selected" && manualPageIds.length > 0
            ? manualPageIds
            : undefined,
        ingestionType: notionScope,
        includeLinkedPages:
          ingestionScope === "selected" ? includeLinkedPages : undefined,
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

    queueProgressRef.current = { current: 0, total: 0 };
    setFinalQueueSnapshot(null);

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
        ? ingestionScope === "workspace"
          ? `Starting manual ${notionScope} workspace-wide ingestion.`
          : `Starting manual ${notionScope} ingestion for the selected page(s)${
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
    ingestionScope,
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

  return useMemo(
    () => ({
      mode,
      setMode,
      notionInput,
      setNotionInput,
      urlInput,
      setUrlInput,
      notionScope,
      setNotionScope,
      ingestionScope,
      setIngestionScope,
      urlScope,
      setUrlScope,
      includeLinkedPages,
      setIncludeLinkedPages,
      manualEmbeddingProvider,
      setEmbeddingProviderAndSave,
      isRunning,
      status,
      runId,
      progress,
      overallProgress,
      finalQueueSnapshot,
      finalMessage,
      errorMessage,
      logs,
      stats,
      hasCompleted,
      autoScrollLogs,
      overallProgressRef,
      logsContainerRef,
      handleLogsScroll,
      handleToggleAutoScroll,
      handleSubmit,
      setHasCompleted,
    }),
    [
      mode,
      notionInput,
      urlInput,
      notionScope,
      ingestionScope,
      urlScope,
      includeLinkedPages,
      manualEmbeddingProvider,
      isRunning,
      status,
      runId,
      progress,
      overallProgress,
      finalQueueSnapshot,
      finalMessage,
      errorMessage,
      logs,
      stats,
      hasCompleted,
      autoScrollLogs,
      setEmbeddingProviderAndSave,
      handleLogsScroll,
      handleToggleAutoScroll,
      handleSubmit,
    ],
  );
}
