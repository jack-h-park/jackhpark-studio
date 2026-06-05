# Database Schema Documentation

This document describes the current RAG-facing schema in [db/schema/schema.latest.sql](/Users/jackpark/workspace/code/core/nextjs-react-notion-x/db/schema/schema.latest.sql:1). It is intended as a human-readable reference; the SQL snapshot remains the executable source of truth for table, view, function, and grant definitions.

## Overview

The database uses PostgreSQL with `pgvector` for retrieval over multiple embedding spaces. The schema separates:

- Document metadata and lifecycle state in `rag_documents`
- Versioned vector chunk storage in `rag_chunks_*`
- Ingestion telemetry in `rag_ingest_runs`
- Aggregate operational snapshots in `rag_snapshot`
- Runtime settings in `system_settings`

## Types

### `rag_document_status`

Lifecycle enum for `rag_documents.status`.

- `active`: Eligible for retrieval
- `archived`: Retained but typically excluded by higher-level flows
- `missing`: Source is currently unavailable or not found
- `soft_deleted`: Externally removed and must not be auto-revived

## Tables

### `rag_documents`

Canonical metadata table for ingested source documents.

- `doc_id` (`text`, PK): Canonical document identifier used across retrieval tables
- `source_url` (`text`, not null): Stable source URL
- `content_hash` (`text`, not null): Full-document content hash for change detection
- `last_ingested_at` (`timestamptz`, not null): Most recent ingestion timestamp
- `last_source_update` (`timestamptz`): Latest known upstream modification timestamp
- `metadata` (`jsonb`, default `{}`): Arbitrary structured metadata used by ranking/admin UIs
- `chunk_count` (`integer`, default `0`): Number of chunks currently associated with the document
- `total_characters` (`bigint`, default `0`): Total character count for the canonical source content
- `raw_doc_id` (`text`): Original external identifier before normalization
- `status` (`rag_document_status`, default `active`): Lifecycle state used by retrieval and admin tooling
- `last_sync_attempt_at` (`timestamptz`): Most recent fetch attempt
- `last_sync_success_at` (`timestamptz`): Most recent successful fetch/parse
- `missing_detected_at` (`timestamptz`): First timestamp when the document was classified as missing
- `soft_deleted_at` (`timestamptz`): Timestamp when the document was externally soft-deleted
- `last_fetch_status` (`integer`): Most recent HTTP/provider status code
- `last_fetch_error` (`text`): Most recent fetch error detail

Notes:

- `status` is operationally significant. The v2 retrieval RPCs only return chunks for documents with `status = 'active'`.
- Detailed lifecycle semantics are documented in [docs/architecture/rag/rag-document-lifecycle.md](/Users/jackpark/workspace/code/core/nextjs-react-notion-x/docs/architecture/rag/rag-document-lifecycle.md:1).

### `rag_ingest_runs`

Per-run ingestion telemetry for freshness, throughput, and error inspection.

- `id` (`uuid`, PK)
- `source` (`text`, not null): Ingestion source identifier
- `ingestion_type` (`text`, not null): `full` or `partial`
- `partial_reason` (`text`): Why a partial run was triggered
- `status` (`text`, not null): `in_progress`, `success`, `completed_with_errors`, or `failed`
- `started_at` / `ended_at` (`timestamptz`): Run boundaries
- `duration_ms` (`integer`): Wall-clock duration when captured
- `documents_processed`, `documents_added`, `documents_updated`, `documents_skipped`
- `chunks_added`, `chunks_updated`
- `characters_added`, `characters_updated`
- `error_count` (`integer`, default `0`)
- `error_logs` (`jsonb`): Structured error details
- `metadata` (`jsonb`): Run-scoped metadata
- `source_url` (`text`): Optional source locator for the run

### `rag_snapshot`

Periodic aggregate snapshot used for dashboards and operational monitoring.

- `id` (`uuid`, PK)
- `captured_at` (`timestamptz`, not null): Snapshot timestamp
- `schema_version` (`integer`, default `1`): Snapshot payload version
- `run_id` (`uuid`, FK -> `rag_ingest_runs.id`): Most recent ingestion run summarized by this row
- `run_status`, `run_started_at`, `run_ended_at`, `run_duration_ms`
- `run_error_count`, `run_documents_skipped`
- `embedding_provider` (`text`, not null): Current deployment-level provider mode, currently written as `multi`
- `ingestion_mode` (`text`): Mirrors the latest run's `ingestion_type` when available
- `total_documents`, `total_chunks`, `total_characters`
- `delta_documents`, `delta_chunks`, `delta_characters`: Change from the previous snapshot
- `error_count`, `skipped_documents`
- `queue_depth`, `retry_count`, `pending_runs`: Reserved operational counters, currently nullable
- `metadata` (`jsonb`, default `{}`): Snapshot-scoped metadata payload
- `created_at` (`timestamptz`, not null): Row creation timestamp

### `system_settings`

Key-value table for runtime configuration.

- `key` (`text`, PK)
- `value` (`jsonb`, not null)
- `updated_at` (`timestamptz`, not null)

### `rag_chunks_gemini_te4_v1`

Gemini `text-embedding-004` chunk storage.

- `id` (`uuid`, PK)
- `doc_id` (`text`, not null)
- `source_url` (`text`)
- `title` (`text`)
- `chunk` (`text`, not null)
- `chunk_hash` (`text`, not null)
- `embedding` (`vector(768)`, not null)
- `updated_at`, `ingested_at` (`timestamptz`)

Important indexes:

- Unique: `("doc_id", "chunk_hash")`
- Vector: IVFFlat index on `embedding`

### `rag_chunks_openai_te3s_v1`

OpenAI `text-embedding-3-small` chunk storage.

- `id` (`uuid`, PK)
- `doc_id` (`text`, not null)
- `source_url` (`text`)
- `title` (`text`)
- `chunk` (`text`, not null)
- `chunk_hash` (`text`, not null)
- `embedding` (`vector(1536)`, not null)
- `updated_at`, `ingested_at` (`timestamptz`)

Important indexes:

- Unique: `("doc_id", "chunk_hash")`
- Vector: IVFFlat index on `embedding`

## Views

### `lc_chunks_gemini_te4_v1`

LangChain-oriented projection over `rag_chunks_gemini_te4_v1`.

- `id`: `concat(doc_id, ':', chunk_hash)`
- `content`: Aliased from `chunk`
- `metadata`: JSONB with `doc_id`, `title`, `source_url`, `chunk_hash`, `ingested_at`
- `embedding`

### `lc_chunks_openai_te3s_v1`

LangChain-oriented projection over `rag_chunks_openai_te3s_v1`.

- Same column contract as the Gemini view

## Functions

### Versioned retrieval functions

The schema contains two retrieval generations:

- `*_v1`: Original retrieval over chunk tables/views only
- `*_v2`: Retrieval that joins `rag_documents` and filters to `status = 'active'`

#### LangChain-oriented RPCs

- `match_langchain_chunks_gemini_te4_v1`
- `match_langchain_chunks_openai_te3s_v1`
- `match_langchain_chunks_gemini_te4_v2`
- `match_langchain_chunks_openai_te3s_v2`

Contract:

- Inputs: `query_embedding`, `match_count`, `filter`
- Return columns: `id`, `content`, `metadata`, `embedding`, `similarity`
- Similarity metric: `1 - (embedding <=> query_embedding)`

#### Native RPCs

- `match_native_chunks_gemini_te4_v1`
- `match_native_chunks_openai_te3s_v1`
- `match_native_chunks_gemini_te4_v2`
- `match_native_chunks_openai_te3s_v2`

Contract:

- Inputs: `query_embedding`, `similarity_threshold`, `match_count`, `filter`
- Return columns: `id`, `doc_id`, `source_url`, `title`, `chunk`, `chunk_hash`, `ingested_at`, `embedding`, `similarity`
- `filter` is applied against a JSONB object built from chunk metadata

### Stable wrapper functions

These wrappers provide provider-stable RPC names for application code:

- `match_rag_chunks_langchain_gemini`
- `match_rag_chunks_langchain_openai`
- `match_rag_chunks_native_gemini`
- `match_rag_chunks_native_openai`

The wrappers currently delegate to versioned retrieval functions defined in the SQL snapshot. Check [db/schema/schema.latest.sql](/Users/jackpark/workspace/code/core/nextjs-react-notion-x/db/schema/schema.latest.sql:278) before changing caller behavior, because wrapper targets may lag behind newer versioned RPCs during migrations.

### `take_rag_snapshot`

Creates a new `rag_snapshot` row by:

- Aggregating current corpus totals from `rag_documents`
- Looking up the previous snapshot for delta calculation
- Looking up the most recent `rag_ingest_runs` row for run summary fields

## Constraints and indexes

Key constraints and indexes reflected in the snapshot:

- Primary keys on all base tables
- Foreign key: `rag_snapshot.run_id -> rag_ingest_runs.id`
- Unique chunk constraints on `("doc_id", "chunk_hash")` for both chunk tables
- B-tree indexes on:
  - `rag_documents.last_ingested_at`
  - `rag_documents.source_url`
  - `rag_ingest_runs.started_at`
  - `rag_snapshot.captured_at`
  - `rag_snapshot.run_id`
- IVFFlat vector indexes on both embedding columns

## Security model

All base tables have RLS enabled in the schema snapshot.

Important caveat:

- The snapshot currently shows `GRANT` statements for `anon`, `authenticated`, and `service_role`.
- It does not document explicit `CREATE POLICY` statements in this file.
- Treat [db/schema/schema.latest.sql](/Users/jackpark/workspace/code/core/nextjs-react-notion-x/db/schema/schema.latest.sql:674) as the source for what is actually exported, and verify live Supabase policies separately when auditing access control.
