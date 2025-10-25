import type { GetServerSideProps } from "next";
import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiFileText } from "@react-icons/all-files/fi/FiFileText";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiLink } from "@react-icons/all-files/fi/FiLink";
import Head from "next/head";
import { useRouter } from "next/router";
import { type ExtendedRecordMap, type PageBlock } from "notion-types";
import { parsePageId } from "notion-utils";
import {
  type ComponentType,
  type FormEvent,
  type JSX,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { NotionContextProvider } from "react-notion-x";
import css from "styled-jsx/css";

import { Footer } from "../../components/Footer";
import { NotionPageHeader } from "../../components/NotionPageHeader";
import { getSupabaseAdminClient } from "../../lib/supabase-admin";

type RunRecord = {
  id: string;
  source: string;
  ingestion_type: "full" | "partial";
  partial_reason: string | null;
  status: "in_progress" | "success" | "completed_with_errors" | "failed";
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  documents_processed: number | null;
  documents_added: number | null;
  documents_updated: number | null;
  documents_skipped: number | null;
  chunks_added: number | null;
  chunks_updated: number | null;
  characters_added: number | null;
  characters_updated: number | null;
  error_count: number | null;
  error_logs: Array<{
    context?: string | null;
    doc_id?: string | null;
    message: string;
  }> | null;
  metadata: Record<string, unknown> | null;
};

type Overview = {
  totalDocuments: number;
  totalChunks: number;
  totalCharacters: number;
  lastUpdatedAt: string | null;
};

type PageProps = {
  overview: Overview;
  runs: RunRecord[];
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

type DocumentRow = {
  chunk_count: number | null;
  total_characters: number | null;
  last_ingested_at: string | number | null;
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNumberOrZero(value: unknown): number {
  return toNullableNumber(value) ?? 0;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function toStatus(value: unknown): RunRecord["status"] {
  if (
    value === "in_progress" ||
    value === "completed_with_errors" ||
    value === "failed"
  ) {
    return value;
  }

  return "success";
}

function toIngestionType(value: unknown): RunRecord["ingestion_type"] {
  return value === "partial" ? "partial" : "full";
}

function toIsoStringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function normalizeErrorLogs(value: unknown): RunRecord["error_logs"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isPlainRecord(entry)) {
        return null;
      }

      const message = entry.message;
      if (typeof message !== "string" || message.length === 0) {
        return null;
      }

      const context = entry.context;
      const docId = entry.doc_id;

      return {
        message,
        context: typeof context === "string" ? context : null,
        doc_id: typeof docId === "string" ? docId : null,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        message: string;
        context: string | null;
        doc_id: string | null;
      } => entry !== null,
    );
}

function normalizeRunRecord(raw: unknown): RunRecord {
  const record: Record<string, unknown> = isPlainRecord(raw) ? raw : {};

  const metadata = isPlainRecord(record.metadata)
    ? (record.metadata as Record<string, unknown>)
    : null;

  const idValue = record.id;
  const startedAtValue = record.started_at;
  const endedAtValue = record.ended_at;

  return {
    id:
      typeof idValue === "string"
        ? idValue
        : idValue !== undefined && idValue !== null
          ? String(idValue)
          : "",
    source: typeof record.source === "string" ? record.source : "unknown",
    ingestion_type: toIngestionType(record.ingestion_type),
    partial_reason: toStringOrNull(record.partial_reason),
    status: toStatus(record.status),
    started_at: toIsoStringOrNull(startedAtValue) ?? new Date(0).toISOString(),
    ended_at: toIsoStringOrNull(endedAtValue),
    duration_ms: toNullableNumber(record.duration_ms),
    documents_processed: toNumberOrZero(record.documents_processed),
    documents_added: toNumberOrZero(record.documents_added),
    documents_updated: toNumberOrZero(record.documents_updated),
    documents_skipped: toNumberOrZero(record.documents_skipped),
    chunks_added: toNumberOrZero(record.chunks_added),
    chunks_updated: toNumberOrZero(record.chunks_updated),
    characters_added: toNumberOrZero(record.characters_added),
    characters_updated: toNumberOrZero(record.characters_updated),
    error_count: toNumberOrZero(record.error_count),
    error_logs: normalizeErrorLogs(record.error_logs),
    metadata,
  };
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

function ManualIngestionPanel(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<"notion_page" | "url">("notion_page");
  const [notionInput, setNotionInput] = useState("");
  const [notionScope, setNotionScope] = useState<"partial" | "full">("partial");
  const [urlScope, setUrlScope] = useState<"partial" | "full">("partial");
  const [urlInput, setUrlInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ManualIngestionStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<ManualLogEntry[]>([]);
  const [stats, setStats] = useState<ManualRunStats | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
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
          setHasCompleted(true);
          setProgress(100);
          setIsRunning(false);
          break;
        default:
          break;
      }
    },
    [appendLog],
  );

  const startManualIngestion = useCallback(async () => {
    if (isRunning) {
      return;
    }

    let payload:
      | {
          mode: "notion_page";
          pageId: string;
          ingestionType: "full" | "partial";
        }
      | {
          mode: "url";
          url: string;
          ingestionType: "full" | "partial";
        };

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
    const startLog =
      mode === "notion_page"
        ? `Starting manual ${notionScope} ingestion for the Notion page.`
        : `Starting manual ${urlScope} ingestion for the provided URL.`;
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
    appendLog,
    handleEvent,
    isRunning,
    mode,
    notionInput,
    notionScope,
    urlInput,
    urlScope,
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
    copy: {
      label: string;
      partialTitle: string;
      partialDesc: string;
      fullTitle: string;
      fullDesc: string;
      hintPartial: string;
      hintFull: string;
    },
    groupName: string,
    labelId: string,
  ) => (
    <fieldset
      className="manual-scope"
      role="radiogroup"
      aria-labelledby={labelId}
    >
      <legend id={labelId} className="manual-scope__label">
        {copy.label}
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
          <span className="manual-scope__title">{copy.partialTitle}</span>
          <span className="manual-scope__desc">{copy.partialDesc}</span>
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
          <span className="manual-scope__title">{copy.fullTitle}</span>
          <span className="manual-scope__desc">{copy.fullDesc}</span>
        </label>
      </div>
      <p className="manual-scope__hint">
        {scope === "full" ? copy.hintFull : copy.hintPartial}
      </p>
    </fieldset>
  );

  const scopeCopy = {
    label: "Ingestion scope",
    partialTitle: "Partial",
    partialDesc: "Skip ingestion when the content matches the last run.",
    fullTitle: "Full",
    fullDesc: "Re-ingest all chunks even if no changes are detected.",
    hintPartial: "Partial runs are quicker and avoid redundant work.",
    hintFull: "Full runs re-embed everything and may take longer.",
  };

  return (
    <>
      <section className="manual-ingestion admin-card">
        {/*
         This style block is necessary for styled-jsx to apply styles to this component,
         as it's defined separately from the main page component where the styles are declared.
        */}
        <style jsx>{styles}</style>
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
                    scopeCopy,
                    "manual-scope-notion",
                    "manual-scope-label-notion",
                  )
                : renderScopeSelector(
                    urlScope,
                    setUrlScope,
                    scopeCopy,
                    "manual-scope-url",
                    "manual-scope-label-url",
                  )}

              <p className="manual-hint">
                {mode === "notion_page"
                  ? "Paste the full shared link or the 32-character page ID from Notion. Choose the scope above to control how much content is reprocessed."
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
                  <div className="progress-bar" aria-hidden="true">
                    <div
                      className="progress-bar__value"
                      style={{
                        width: `${Math.max(0, Math.min(100, progress))}%`,
                      }}
                    />
                  </div>
                  <div className="progress-meta">
                    <span className="progress-percent">
                      {Math.round(progress)}%
                    </span>
                    {finalMessage ? (
                      <span className="progress-message">{finalMessage}</span>
                    ) : null}
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
            <h3>Run Log</h3>
            <span className="manual-logs__meta">
              {logs.length === 0
                ? "Awaiting events"
                : `${logs.length} entr${logs.length === 1 ? "y" : "ies"}`}
            </span>
            {hasCompleted && !isRunning ? (
              <button
                type="button"
                className="manual-logs__refresh-button"
                onClick={() => {
                  void router.replace(router.asPath);
                }}
              >
                Refresh Dashboard
              </button>
            ) : null}
          </header>
          {logs.length === 0 ? (
            <div className="manual-logs__empty">
              Execution logs will appear here.
            </div>
          ) : (
            <ul className="manual-logs__list">
              {logs.map((log) => {
                const Icon = LOG_ICONS[log.level];
                return (
                  <li
                    key={log.id}
                    className={`manual-log-entry manual-log-entry--${log.level}`}
                  >
                    <span className="manual-log-entry__icon" aria-hidden="true">
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
    </>
  );
}

function IngestionDashboard({ overview, runs }: PageProps): JSX.Element {
  const ManualIngestionPanel = (): JSX.Element => {
    const router = useRouter();
    const [mode, setMode] = useState<"notion_page" | "url">("notion_page");
    const [notionInput, setNotionInput] = useState("");
    const [notionScope, setNotionScope] = useState<"partial" | "full">(
      "partial",
    );
    const [urlScope, setUrlScope] = useState<"partial" | "full">("partial");
    const [urlInput, setUrlInput] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<ManualIngestionStatus>("idle");
    const [runId, setRunId] = useState<string | null>(null);
    const [finalMessage, setFinalMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [logs, setLogs] = useState<ManualLogEntry[]>([]);
    const [stats, setStats] = useState<ManualRunStats | null>(null);
    const [hasCompleted, setHasCompleted] = useState(false);
    const mountedRef = useRef(true);

    useEffect(() => {
      return () => {
        mountedRef.current = false;
      };
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
            setHasCompleted(true);
            setProgress(100);
            setIsRunning(false);
            break;
          default:
            break;
        }
      },
      [appendLog],
    );

    const startManualIngestion = useCallback(async () => {
      if (isRunning) {
        return;
      }

      let payload:
        | {
            mode: "notion_page";
            pageId: string;
            ingestionType: "full" | "partial";
          }
        | {
            mode: "url";
            url: string;
            ingestionType: "full" | "partial";
          };

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
      const startLog =
        mode === "notion_page"
          ? `Starting manual ${notionScope} ingestion for the Notion page.`
          : `Starting manual ${urlScope} ingestion for the provided URL.`;
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
      appendLog,
      handleEvent,
      isRunning,
      mode,
      notionInput,
      notionScope,
      urlInput,
      urlScope,
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
      copy: {
        label: string;
        partialTitle: string;
        partialDesc: string;
        fullTitle: string;
        fullDesc: string;
        hintPartial: string;
        hintFull: string;
      },
      groupName: string,
      labelId: string,
    ) => (
      <fieldset
        className="manual-scope"
        role="radiogroup"
        aria-labelledby={labelId}
      >
        <legend id={labelId} className="manual-scope__label">
          {copy.label}
        </legend>
        <div className="manual-scope__controls">
          <label
            className={`manual-scope__option ${
              scope === "partial" ? "is-active" : ""
            } ${isRunning ? "is-disabled" : ""}`}
          >
            <input
              type="radio"
              name={groupName}
              value="partial"
              checked={scope === "partial"}
              onChange={() => setScope("partial")}
              disabled={isRunning}
            />
            <span className="manual-scope__title">{copy.partialTitle}</span>
            <span className="manual-scope__desc">{copy.partialDesc}</span>
          </label>
          <label
            className={`manual-scope__option ${
              scope === "full" ? "is-active" : ""
            } ${isRunning ? "is-disabled" : ""}`}
          >
            <input
              type="radio"
              name={groupName}
              value="full"
              checked={scope === "full"}
              onChange={() => setScope("full")}
              disabled={isRunning}
            />
            <span className="manual-scope__title">{copy.fullTitle}</span>
            <span className="manual-scope__desc">{copy.fullDesc}</span>
          </label>
        </div>
        <p className="manual-scope__hint">
          {scope === "full" ? copy.hintFull : copy.hintPartial}
        </p>
      </fieldset>
    );

    const notionScopeCopy = {
      label: "Ingestion scope",
      partialTitle: "Partial",
      partialDesc: "Re-embed the page only if changes are detected.",
      fullTitle: "Full",
      fullDesc: "Force a complete re-embed of every chunk in this page.",
      hintPartial: "Partial runs are quicker and skip unchanged content.",
      hintFull: "Full runs can take longer for large pages.",
    };

    const urlScopeCopy = {
      label: "Ingestion scope",
      partialTitle: "Partial",
      partialDesc: "Skip re-ingesting when the article content hasn't changed.",
      fullTitle: "Full",
      fullDesc: "Re-ingest the article even if the content appears unchanged.",
      hintPartial: "Partial runs save time by avoiding redundant ingestion.",
      hintFull:
        "Full runs ensure embeddings stay fresh even without detected diffs.",
    };

    return (
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
                    className={`manual-tab ${
                      isActive ? "manual-tab--active" : ""
                    }`}
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
                    notionScopeCopy,
                    "manual-scope-notion",
                    "manual-scope-label-notion",
                  )
                : renderScopeSelector(
                    urlScope,
                    setUrlScope,
                    urlScopeCopy,
                    "manual-scope-url",
                    "manual-scope-label-url",
                  )}

              <p className="manual-hint">
                {mode === "notion_page"
                  ? "Paste the full shared link or the 32-character page ID from Notion. Choose the scope above to control how much content is reprocessed."
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
                  <div className="progress-bar" aria-hidden="true">
                    <div
                      className="progress-bar__value"
                      style={{
                        width: `${Math.max(0, Math.min(100, progress))}%`,
                      }}
                    />
                  </div>
                  <div className="progress-meta">
                    <span className="progress-percent">
                      {Math.round(progress)}%
                    </span>
                    {finalMessage ? (
                      <span className="progress-message">{finalMessage}</span>
                    ) : null}
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
            <h3>Run Log</h3>
            <span className="manual-logs__meta">
              {logs.length === 0
                ? "Awaiting events"
                : `${logs.length} entr${logs.length === 1 ? "y" : "ies"}`}
            </span>
            {hasCompleted && !isRunning ? (
              <button
                type="button"
                className="manual-logs__refresh-button"
                onClick={() => {
                  void router.replace(router.asPath);
                }}
              >
                Refresh Dashboard
              </button>
            ) : null}
          </header>
          {logs.length === 0 ? (
            <div className="manual-logs__empty">
              Execution logs will appear here.
            </div>
          ) : (
            <ul className="manual-logs__list">
              {logs.map((log) => {
                const Icon = LOG_ICONS[log.level];
                return (
                  <li
                    key={log.id}
                    className={`manual-log-entry manual-log-entry--${log.level}`}
                  >
                    <span className="manual-log-entry__icon" aria-hidden="true">
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
    );
  };

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
            <h1>Ingestion Dashboard</h1>
            <p>
              Monitor ingestion health, trigger manual runs, and review the
              latest dataset snapshot.
            </p>
          </header>

          <div className="admin-stack">
            <ManualIngestionPanel />

            <section className="admin-card admin-section">
              <header className="admin-section__header">
                <h2>Current Snapshot</h2>
                <p className="admin-section__description">
                  Aggregate metrics across the latest indexed content.
                </p>
              </header>
              <div className="admin-metrics">
                <div className="admin-metric">
                  <span className="admin-metric__label">Documents</span>
                  <span className="admin-metric__value">
                    {numberFormatter.format(overview.totalDocuments)}
                  </span>
                </div>
                <div className="admin-metric">
                  <span className="admin-metric__label">Chunks</span>
                  <span className="admin-metric__value">
                    {numberFormatter.format(overview.totalChunks)}
                  </span>
                </div>
                <div className="admin-metric">
                  <span className="admin-metric__label">Content Size</span>
                  <span className="admin-metric__value">
                    {formatCharacters(overview.totalCharacters)}
                  </span>
                </div>
                <div className="admin-metric">
                  <span className="admin-metric__label">Last Updated</span>
                  <span className="admin-metric__value">
                    <ClientSideDate value={overview.lastUpdatedAt} />
                  </span>
                </div>
              </div>
            </section>

            <section className="admin-card admin-section">
              <header className="admin-section__header">
                <h2>Recent Runs</h2>
                <p className="admin-section__description">
                  Latest ingestion activity from manual and scheduled jobs.
                </p>
              </header>
              <div className="admin-table">
                <table className="admin-table__grid">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Status</th>
                      <th>Type</th>
                      <th>Duration</th>
                      <th>Chunks</th>
                      <th>Docs</th>
                      <th>Data Added</th>
                      <th>Data Updated</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="admin-table__empty">
                          No ingestion runs have been recorded yet.
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
                        const urlCount = getNumericMetadata(
                          run.metadata,
                          "urlCount",
                        );
                        const pageUrl = getStringMetadata(
                          run.metadata,
                          "pageUrl",
                        );
                        const pageId = getStringMetadata(
                          run.metadata,
                          "pageId",
                        );
                        const targetUrl = getStringMetadata(
                          run.metadata,
                          "url",
                        );
                        const hostname = getStringMetadata(
                          run.metadata,
                          "hostname",
                        );
                        const manualScope = getStringMetadata(
                          run.metadata,
                          "ingestionType",
                        );
                        const manualScopeLabel =
                          manualScope === "full"
                            ? "Full"
                            : manualScope === "partial"
                              ? "Partial"
                              : manualScope;
                        return (
                          <tr key={run.id}>
                            <td>
                              <div>
                                <ClientSideDate value={run.started_at} />
                              </div>
                              {run.ended_at ? (
                                <div className="admin-table__meta">
                                  Finished:{" "}
                                  <ClientSideDate value={run.ended_at} />
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <span
                                className={`status-pill status-pill--${run.status}`}
                              >
                                {run.status.replaceAll("_", " ")}
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
                                {run.ingestion_type === "full"
                                  ? "Full"
                                  : "Partial"}
                              </span>
                              {run.partial_reason ? (
                                <div className="admin-table__meta">
                                  {run.partial_reason}
                                </div>
                              ) : null}
                            </td>
                            <td>{formatDuration(run.duration_ms ?? 0)}</td>
                            <td>
                              <div>
                                Added:{" "}
                                {numberFormatter.format(run.chunks_added ?? 0)}
                              </div>
                              <div>
                                Updated:{" "}
                                {numberFormatter.format(
                                  run.chunks_updated ?? 0,
                                )}
                              </div>
                            </td>
                            <td>
                              <div>
                                Added:{" "}
                                {numberFormatter.format(
                                  run.documents_added ?? 0,
                                )}
                              </div>
                              <div>
                                Updated:{" "}
                                {numberFormatter.format(
                                  run.documents_updated ?? 0,
                                )}
                              </div>
                              <div>
                                Skipped:{" "}
                                {numberFormatter.format(
                                  run.documents_skipped ?? 0,
                                )}
                              </div>
                            </td>
                            <td>
                              {formatCharacters(run.characters_added ?? 0)}
                            </td>
                            <td>
                              {formatCharacters(run.characters_updated ?? 0)}
                            </td>
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
                                  <a
                                    href={pageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {pageUrl}
                                  </a>
                                </div>
                              ) : null}
                              {targetUrl ? (
                                <div className="admin-table__meta">
                                  URL:{" "}
                                  <a
                                    href={targetUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
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
                              {manualScopeLabel ? (
                                <div className="admin-table__meta">
                                  Scope: {manualScopeLabel}
                                </div>
                              ) : null}
                              {!rootPageId &&
                              !pageId &&
                              !pageUrl &&
                              !targetUrl &&
                              !hostname &&
                              urlCount === null &&
                              !manualScopeLabel ? (
                                <div className="admin-table__meta">—</div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
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
    // 서버 렌더링 및 초기 클라이언트 렌더링 시에는 placeholder를 보여줍니다.
    // 이렇게 하면 서버와 클라이언트의 초기 UI가 일치하게 됩니다.
    return <span>--</span>;
  }

  return <>{formatDate(value)}</>;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (
  _context,
) => {
  const supabase = getSupabaseAdminClient();

  const { data: runsData } = await supabase
    .from("rag_ingest_runs")
    .select(
      "id, source, ingestion_type, partial_reason, status, started_at, ended_at, duration_ms, documents_processed, documents_added, documents_updated, documents_skipped, chunks_added, chunks_updated, characters_added, characters_updated, error_count, error_logs, metadata",
    )
    .order("started_at", { ascending: false })
    .limit(50);

  const { data: documentsData } = await supabase
    .from("rag_documents")
    .select("doc_id, chunk_count, total_characters, last_ingested_at");

  const runs: RunRecord[] = (runsData ?? []).map((run: unknown) =>
    normalizeRunRecord(run),
  );

  const docs: DocumentRow[] = (documentsData ?? []) as DocumentRow[];
  const totalDocuments = docs.length;
  const totalChunks = docs.reduce<number>(
    (sum, doc) => sum + (doc.chunk_count ?? 0),
    0,
  );
  const totalCharacters = docs.reduce<number>(
    (sum, doc) => sum + (doc.total_characters ?? 0),
    0,
  );
  const lastUpdatedTimestamp = docs.reduce<number | null>((latest, doc) => {
    const date = parseDate(doc.last_ingested_at);
    if (!date) {
      return latest;
    }

    const timestamp = date.getTime();
    if (Number.isNaN(timestamp)) {
      return latest;
    }

    if (latest === null || timestamp > latest) {
      return timestamp;
    }

    return latest;
  }, null);

  const lastUpdatedAt =
    lastUpdatedTimestamp === null
      ? null
      : new Date(lastUpdatedTimestamp).toISOString();

  return {
    props: {
      overview: {
        totalDocuments,
        totalChunks,
        totalCharacters,
        lastUpdatedAt,
      },
      runs,
    },
  };
};

const styles = css.global`
  .admin-ingestion-page {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-color, #f7f6f3);
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
    padding: clamp(3.5rem, 6vw, 5rem) clamp(2rem, 4vw, 3.5rem) 5.5rem;
    color: var(--fg-color, rgba(55, 53, 47, 0.95));
    line-height: 1.6;
  }

  .admin-hero {
    margin-bottom: 2.5rem;
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

  .admin-stack {
    display: flex;
    flex-direction: column;
    gap: clamp(1.75rem, 3vw, 2.6rem);
  }

  .admin-card {
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid rgba(55, 53, 47, 0.16);
    border-radius: 18px;
    padding: 2.1rem 2.3rem;
    box-shadow: 0 26px 60px -36px rgba(15, 15, 15, 0.28);
    backdrop-filter: blur(10px);
  }

  .admin-section__header {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 1.5rem;
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

  .admin-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1.2rem;
  }

  .admin-metric {
    border: 1px solid rgba(55, 53, 47, 0.12);
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    background: rgba(255, 255, 255, 0.94);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .admin-metric__label {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(55, 53, 47, 0.5);
  }

  .admin-metric__value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--fg-color, rgba(55, 53, 47, 0.92));
  }

  .admin-table {
    border: 1px solid rgba(55, 53, 47, 0.14);
    border-radius: 16px;
    overflow-x: auto;
    background: rgba(255, 255, 255, 0.95);
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
    padding: 0.9rem 1.1rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(55, 53, 47, 0.6);
  }

  .admin-table__grid tbody td {
    padding: 1rem 1.1rem;
    border-top: 1px solid rgba(55, 53, 47, 0.08);
    vertical-align: top;
    font-size: 0.95rem;
    color: rgba(55, 53, 47, 0.85);
  }

  .admin-table__grid tbody tr:first-child td {
    border-top: none;
  }

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
    margin-top: 0.35rem;
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .admin-issues {
    margin-top: 0.6rem;
  }

  .admin-issues summary {
    cursor: pointer;
    color: rgba(46, 170, 220, 0.85);
    font-size: 0.9rem;
  }

  .admin-issues ul {
    margin: 0.45rem 0 0;
    padding-left: 1.25rem;
    color: rgba(55, 53, 47, 0.7);
    font-size: 0.9rem;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
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

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.3rem 0.8rem;
    border-radius: 999px;
    background: rgba(55, 53, 47, 0.08);
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.75);
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

  .manual-field input {
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

  .manual-field input:focus {
    outline: none;
    border-color: rgba(46, 170, 220, 0.65);
    box-shadow: 0 0 0 2px rgba(46, 170, 220, 0.18);
  }

  .manual-field input:disabled {
    background: rgba(245, 244, 240, 0.7);
    color: rgba(55, 53, 47, 0.5);
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
    position: relative;
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
    text-align: left;
  }

  .manual-scope__option input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
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
  }

  .manual-scope__desc {
    font-size: 0.82rem;
    color: rgba(55, 53, 47, 0.6);
  }

  .manual-scope__hint {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(55, 53, 47, 0.55);
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
    flex: 1 1 220px;
    min-width: 220px;
    display: grid;
    gap: 0.5rem;
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
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9rem;
    color: rgba(55, 53, 47, 0.65);
  }

  .progress-message {
    color: rgba(55, 53, 47, 0.7);
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
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.85rem;
  }

  .manual-logs__header h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: rgba(55, 53, 47, 0.9);
  }

  .manual-logs__meta {
    font-size: 0.85rem;
    color: rgba(55, 53, 47, 0.55);
  }

  .manual-logs__refresh-button {
    border: 1px solid rgba(55, 53, 47, 0.18);
    background: rgba(255, 255, 255, 0.9);
    color: rgba(55, 53, 47, 0.8);
    padding: 0.3rem 0.8rem;
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

export default IngestionDashboard;
