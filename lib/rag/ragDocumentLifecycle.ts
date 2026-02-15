import type { SupabaseClient } from "@supabase/supabase-js";

import { debugIngestionLog } from "./debug";

const DOCUMENTS_TABLE = "rag_documents";

export type FetchClassification = "success" | "missing" | "auth" | "other";

export type FetchOutcome = {
  classification: FetchClassification;
  statusCode: number | null;
  shortError: string | null;
};

type OutcomeInput = {
  response?: Response | null;
  error?: unknown | null;
};

const AUTH_ERROR_CODES = new Set([
  "unauthorized",
  "forbidden",
  "restricted_resource",
]);

const MISSING_ERROR_CODES = new Set(["object_not_found", "not_found"]);

const MAX_ERROR_LENGTH = 200;

function toShortError(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length <= MAX_ERROR_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_ERROR_LENGTH - 3)}...`;
}

function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const candidate = error as {
    status?: number;
    statusCode?: number;
    status_code?: number;
  };
  const status =
    candidate.status ?? candidate.statusCode ?? candidate.status_code ?? null;
  return typeof status === "number" ? status : null;
}

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const candidate = error as { code?: string; errorCode?: string };
  const code = candidate.code ?? candidate.errorCode ?? null;
  return typeof code === "string" && code.trim().length > 0
    ? code.trim()
    : null;
}

function extractErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.name;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function classifyOutcome(statusCode: number | null, errorCode: string | null) {
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    return "success" as const;
  }
  if (statusCode === 404 || (errorCode && MISSING_ERROR_CODES.has(errorCode))) {
    return "missing" as const;
  }
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    (errorCode && AUTH_ERROR_CODES.has(errorCode))
  ) {
    return "auth" as const;
  }
  return "other" as const;
}

export function normalizeFetchOutcome({
  response,
  error,
}: OutcomeInput): FetchOutcome {
  if (response) {
    const statusCode = response.status ?? null;
    if (response.ok) {
      return { classification: "success", statusCode, shortError: null };
    }
    const shortError = toShortError(
      `${response.status} ${response.statusText}`.trim(),
    );
    return {
      classification: classifyOutcome(statusCode, null),
      statusCode,
      shortError,
    };
  }

  const statusCode = extractStatusCode(error);
  const errorCode = extractErrorCode(error);
  const message = extractErrorMessage(error);
  const shortError = toShortError(
    [errorCode, message].filter(Boolean).join(": "),
  );

  return {
    classification: classifyOutcome(statusCode, errorCode),
    statusCode,
    shortError,
  };
}

function logLifecycle(docId: string, outcome: FetchOutcome) {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  debugIngestionLog("doc-lifecycle", {
    docId,
    classification: outcome.classification,
    statusCode: outcome.statusCode,
  });
}

async function logLifecycleError(
  action: string,
  docId: string,
  error: unknown,
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const message = extractErrorMessage(error);
  debugIngestionLog("doc-lifecycle-error", {
    action,
    docId,
    message: toShortError(message),
  });
}

export async function markAttempt(
  supabase: SupabaseClient,
  docId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({
        last_sync_attempt_at: new Date().toISOString(),
        last_fetch_status: null,
        last_fetch_error: null,
      })
      .eq("doc_id", docId);

    if (error) {
      await logLifecycleError("markAttempt", docId, error);
    }
  } catch (err) {
    await logLifecycleError("markAttempt", docId, err);
  }
}

export async function markSuccess(
  supabase: SupabaseClient,
  docId: string,
  statusCode: number | null = 200,
): Promise<void> {
  const outcome: FetchOutcome = {
    classification: "success",
    statusCode,
    shortError: null,
  };
  logLifecycle(docId, outcome);

  try {
    const { error: fetchError } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({
        last_fetch_status: statusCode,
        last_fetch_error: null,
      })
      .eq("doc_id", docId);
    if (fetchError) {
      await logLifecycleError("markSuccess.fetch", docId, fetchError);
    }

    const { error: successError } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({
        last_sync_success_at: new Date().toISOString(),
      })
      .eq("doc_id", docId)
      .neq("status", "soft_deleted");
    if (successError) {
      await logLifecycleError("markSuccess.successAt", docId, successError);
    }

    const { error: statusError } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({ status: "active" })
      .eq("doc_id", docId)
      .eq("status", "missing")
      .neq("status", "soft_deleted");
    if (statusError) {
      await logLifecycleError("markSuccess.status", docId, statusError);
    }
  } catch (err) {
    await logLifecycleError("markSuccess", docId, err);
  }
}

export async function markMissing(
  supabase: SupabaseClient,
  docId: string,
  statusCode: number | null,
  errorMessage: string | null,
): Promise<void> {
  const outcome: FetchOutcome = {
    classification: "missing",
    statusCode,
    shortError: errorMessage,
  };
  logLifecycle(docId, outcome);

  try {
    const { error: fetchError } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({
        last_fetch_status: statusCode,
        last_fetch_error: errorMessage,
      })
      .eq("doc_id", docId);
    if (fetchError) {
      await logLifecycleError("markMissing.fetch", docId, fetchError);
    }

    const { error: statusError } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({ status: "missing" })
      .eq("doc_id", docId)
      .neq("status", "soft_deleted");
    if (statusError) {
      await logLifecycleError("markMissing.status", docId, statusError);
    }

    const { error: missingAtError } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({ missing_detected_at: new Date().toISOString() })
      .eq("doc_id", docId)
      .neq("status", "soft_deleted")
      .is("missing_detected_at", null);
    if (missingAtError) {
      await logLifecycleError("markMissing.detectedAt", docId, missingAtError);
    }
  } catch (err) {
    await logLifecycleError("markMissing", docId, err);
  }
}

export async function markAuthError(
  supabase: SupabaseClient,
  docId: string,
  statusCode: number | null,
  errorMessage: string | null,
): Promise<void> {
  const outcome: FetchOutcome = {
    classification: "auth",
    statusCode,
    shortError: errorMessage,
  };
  logLifecycle(docId, outcome);

  try {
    const { error } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({
        last_fetch_status: statusCode,
        last_fetch_error: errorMessage,
      })
      .eq("doc_id", docId);

    if (error) {
      await logLifecycleError("markAuthError", docId, error);
    }
  } catch (err) {
    await logLifecycleError("markAuthError", docId, err);
  }
}

export async function markFetchError(
  supabase: SupabaseClient,
  docId: string,
  statusCode: number | null,
  errorMessage: string | null,
): Promise<void> {
  const outcome: FetchOutcome = {
    classification: "other",
    statusCode,
    shortError: errorMessage,
  };
  logLifecycle(docId, outcome);

  try {
    const { error } = await supabase
      .from(DOCUMENTS_TABLE)
      .update({
        last_fetch_status: statusCode,
        last_fetch_error: errorMessage,
      })
      .eq("doc_id", docId);

    if (error) {
      await logLifecycleError("markFetchError", docId, error);
    }
  } catch (err) {
    await logLifecycleError("markFetchError", docId, err);
  }
}
