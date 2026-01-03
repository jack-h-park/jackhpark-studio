# Database Schema Documentation

This document describes the database schema defined in `db/schema/schema.latest.sql`.

## Overview

The database uses PostgreSQL with `pgvector` for storing and querying vector embeddings. It supports multiple embedding providers (e.g., Gemini, OpenAI) using versioned tables to allow matching logic to evolve.

## Tables

### RAG and Ingestion

#### `rag_documents`

Tracks the source documents ingested into the system.

- `doc_id` (text, PK): Canonical ID.
- `source_url` (text): Source URL.
- `content_hash` (text): Hash of the full content to detect changes.
- `last_ingested_at` (timestamptz): Last ingestion timestamp.
- `metadata` (jsonb): Arbitrary metadata.

#### `rag_ingest_runs`

Logs details about ingestion jobs.

- `id` (uuid, PK)
- `ingestion_type` (text): `full` or `partial`.
- `status` (text): `in_progress`, `success`, `completed_with_errors`, `failed`.
- `documents_processed`, `documents_added`, `chunks_added`, `error_count`, etc.

#### `rag_snapshot`

captures aggregate statistics of the RAG corpus size and the last run status.

- `id` (uuid, PK)
- `captured_at` (timestamptz)
- `total_documents`, `total_chunks`, `total_characters`
- `delta_documents`, `delta_chunks` (changes since last snapshot)

#### `system_settings`

Key-value store for runtime configuration.

- `key` (text, PK)
- `value` (jsonb)

### Embedding / Chunk Tables

These tables store the actual vector chunks. They are versioned by provider and embedding model generation.

#### `rag_chunks_gemini_te4_v1`

- `id` (uuid, PK)
- `doc_id` (text): Foreign key reference to document.
- `chunk` (text): The text content.
- `embedding` (vector(768)): Gemini text-embedding-004 embedding.
- `chunk_hash`, `title`, `source_url`, `ingested_at`.

#### `rag_chunks_openai_te3s_v1`

- `id` (uuid, PK)
- `doc_id` (text)
- `chunk` (text)
- `embedding` (vector(1536)): OpenAI text-embedding-3-small embedding.

## Views

Views are provided to expose a standard interface for LangChain or other consumers, often aliasing the underlying versioned tables.

#### `lc_chunks_gemini_te4_v1`

LangChain-compatible view for Gemini chunks.

- `id`: `doc_id:chunk_hash` composite key.
- `content`: Aliased from `chunk`.
- `metadata`: JSONB containing `doc_id`, `title`, `source_url`, etc.
- `embedding`

#### `lc_chunks_openai_te3s_v1`

LangChain-compatible view for OpenAI chunks.

## Functions

### Matching Functions

#### `match_langchain_chunks_gemini_te4_v1`

Returns chunks similar to a query embedding for LangChain (Gemini).

- Inputs: `query_embedding`, `match_count`, `filter`.

#### `match_langchain_chunks_openai_te3s_v1`

Returns chunks similar to a query embedding for LangChain (OpenAI).

#### `match_native_chunks_gemini_te4_v1`

Standard RAG matching function for Gemini. Returns detailed columns (`chunk`, `doc_id`, `source_url`).

- Inputs: `query_embedding`, `similarity_threshold`, `match_count`, `filter`.

#### `match_native_chunks_openai_te3s_v1`

Standard RAG matching function for OpenAI.

### Wrapper Functions

Convenience wrappers that delegate to the specific versioned functions.

- `match_rag_chunks_langchain_gemini` -> `match_langchain_chunks_gemini_te4_v1`
- `match_rag_chunks_langchain_openai` -> `match_langchain_chunks_openai_te3s_v1`
- `match_rag_chunks_native_gemini` -> `match_native_chunks_gemini_te4_v1`
- `match_rag_chunks_native_openai` -> `match_native_chunks_openai_te3s_v1`

### Snapshot

#### `take_rag_snapshot`

Aggregates current `rag_documents` stats, compares with the last `rag_snapshot`, and inserts a new snapshot record. Used for telemetry and monitoring.

## Row Level Security (RLS)

All tables (`rag_documents`, `rag_ingest_runs`, `rag_snapshot`, `system_settings`, chunk tables) have RLS enabled.
Grant usage policies are applied for `anon`, `authenticated`, and `service_role`.
