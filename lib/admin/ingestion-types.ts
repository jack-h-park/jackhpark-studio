import type { ModelProvider } from "../shared/model-provider";
import type {
  IngestionType,
  RunRecord,
  RunStatus,
} from "./ingestion-runs";

export type SnapshotSummary = {
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

export type DatasetSnapshotOverview = {
  latest: SnapshotSummary | null;
  history: SnapshotSummary[];
};

export type RecentRunsSnapshot = {
  runs: RunRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type SystemHealthOverview = {
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

export type ManualRunStats = {
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

export type ManualIngestionStatus =
  | "idle"
  | "in_progress"
  | "success"
  | "completed_with_errors"
  | "failed";

export type ManualEvent =
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

export type ManualLogEvent = {
  id: string;
  message: string;
  level: "info" | "warn" | "error";
  timestamp: number;
};

export type RunsApiResponse = {
  runs: RunRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  statusOptions: RunStatus[];
  ingestionTypeOptions: IngestionType[];
};
