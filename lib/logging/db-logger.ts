import { dbLogger } from "@/lib/logging/logger";

export type DbQueryMeta = {
  action: string;
  operation: string;
  table: string;
  correlationId?: string;
};

const MAX_MESSAGE_LENGTH = 256;

function truncateMessage(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_MESSAGE_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_MESSAGE_LENGTH - 3)}...`;
}

function sanitizeDbErrorMessage(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }

  if (typeof error === "string") {
    return truncateMessage(error);
  }

  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.length > 0) {
      return truncateMessage(maybeMessage);
    }
  }

  return undefined;
}

function extractDbErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null) {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.length > 0) {
      return maybeCode;
    }
  }
  return undefined;
}

export function logDbQueryStart(meta: DbQueryMeta) {
  dbLogger.debug("query:start", meta);
}

export function logDbQueryDone(payload: DbQueryMeta & {
  elapsedMs?: number;
  rowCount?: number;
}) {
  dbLogger.debug("query:done", payload);
}

export function logDbQueryError(payload: DbQueryMeta & {
  elapsedMs?: number;
  errorCode?: string;
  message?: string;
}) {
  dbLogger.error("query:error", payload);
}

export function startDbQuery(meta: DbQueryMeta) {
  const startTime = Date.now();
  logDbQueryStart(meta);

  return {
    done: (payload?: { rowCount?: number }) => {
      const elapsedMs = Date.now() - startTime;
      logDbQueryDone({ ...meta, elapsedMs, ...payload });
    },
    error: (error: unknown) => {
      const elapsedMs = Date.now() - startTime;
      logDbQueryError({
        ...meta,
        elapsedMs,
        errorCode: extractDbErrorCode(error),
        message: sanitizeDbErrorMessage(error),
      });
    },
  };
}
