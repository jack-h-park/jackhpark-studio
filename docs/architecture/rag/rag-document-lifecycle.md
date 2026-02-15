# RAG Document Lifecycle

## Purpose
The RAG ingestion pipeline tracks a lightweight lifecycle state for each
document to keep ingestion, retrieval, and admin visibility consistent when
sources are deleted, moved, or temporarily inaccessible.

This document summarizes the lifecycle model implemented for Notion and URL
ingestion and how it affects retrieval.

## Status Model
`rag_documents.status` is an enum with the following values:

- `active`: Document is available and eligible for retrieval.
- `archived`: Document is intentionally kept but should typically be treated
  as inactive by downstream systems.
- `missing`: Source was not found (404 / `object_not_found`).
- `soft_deleted`: Externally deleted or hidden. Must not auto-revive.

Note: `soft_deleted` is **externally managed**. The ingestion pipeline does not
set this status.

## Core Fields
`rag_documents` includes the following lifecycle fields:

- `status`
- `last_sync_attempt_at`
- `last_sync_success_at`
- `missing_detected_at`
- `soft_deleted_at`
- `last_fetch_status`
- `last_fetch_error`

## Lifecycle Updates (Ingestion)
The ingestion pipeline updates lifecycle fields on every fetch attempt:

### markAttempt
- Runs before each per-document fetch.
- Sets `last_sync_attempt_at = now()`.
- Clears `last_fetch_status` and `last_fetch_error`.

### markSuccess
- Runs on successful fetch + parse.
- Sets `last_fetch_status = 200` (or actual status).
- Clears `last_fetch_error`.
- If current status is `missing`, set status to `active`.
- Sets `last_sync_success_at = now()` **only if** status is not `soft_deleted`.

### markMissing
- Runs on Notion `object_not_found`, HTTP 404, or Notion “page not found”
  messages even when no status code is present.
- Sets status to `missing` unless currently `soft_deleted`.
- Sets `missing_detected_at` **once** via a conditional update (only when the
  field is null).
- Updates `last_fetch_status`, `last_fetch_error`, and `last_sync_attempt_at`.

### markAuthError
- Runs on Notion `unauthorized`, `forbidden`, `restricted_resource`
  or HTTP 401/403.
- Does **not** change `status` or `missing_detected_at`.
- Updates `last_fetch_status` and `last_fetch_error`.

### markFetchError
- Runs on all other fetch failures (timeouts, 5xx, etc.).
- Does **not** change `status`.
- Updates `last_fetch_status` and `last_fetch_error` when available.

## Fetch Outcome Mapping
Ingestion uses the following classification:

- Success: HTTP 2xx or Notion success.
- Missing: HTTP 404 or Notion `object_not_found`.
  - Message-only Notion “page not found” errors are coerced to 404.
- Auth: HTTP 401/403 or Notion `unauthorized`, `forbidden`,
  `restricted_resource`.
- Other: all remaining failures.

## Soft Deleted Behavior
Documents marked `soft_deleted` are **not** automatically revived. Specifically:

- `markSuccess` will not update `status` from `soft_deleted`.
- `last_sync_success_at` is not updated for `soft_deleted` documents.
- Retrieval (v2) excludes `soft_deleted` documents.

## Admin UI Behavior
The Admin > RAG Documents list surfaces the `status` value and provides a
status filter.

- `Status = Any` shows all statuses (including `soft_deleted`).
- Selecting a specific status filters to that status.

## Retrieval Behavior (v2 RPCs)
The v2 retrieval RPCs only return chunks for documents where
`rag_documents.status = 'active'`. This ensures missing/soft-deleted documents
are excluded at query time.

## Notes
- No garbage collection of chunks/embeddings is performed in lifecycle updates.
- `soft_deleted` is expected to be set by admin tooling or direct DB updates.
- If `markMissing` affects zero rows (doc mismatch/RLS/not found), a warning is
  logged for investigation.
