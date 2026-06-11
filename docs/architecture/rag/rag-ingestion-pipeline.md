# RAG Ingestion Pipeline

> **Derives from canonical:** [RAG System](../../canonical/rag/rag-system.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

**Status:** authoritative
**Implementations:** `lib/rag/pipeline.ts` (shared core), `lib/rag/sources/{notion,url}.ts` (source adapters), `lib/rag/index.ts` (chunking/persistence primitives), `lib/admin/manual-ingestor.ts` + `scripts/ingest-{notion,url}.ts` (thin callers)

Related: [RAG Document Lifecycle](./rag-document-lifecycle.md)

This document details the **Write Path** of the RAG system: how data is fetched, processed, chunked, and stored in the vector database.  
Canonical invariants on chunking/token budgets, change detection, and ingestion hygiene live in [RAG System](../../canonical/rag/rag-system.md); this page focuses on the implementation hooks that satisfy those invariants.

---

## 1. Overview

The ingestion system follows a "push" model triggered via the Admin UI or scripts. It supports two primary strategies:

1.  **Atomic Document Updates:** Replaces all chunks for a document if its content hash changes.
2.  **Versioning:** Supports multiple embedding providers (OpenAI, Gemini) concurrently via isolated tables.

### Architecture: shared core + source adapters

Source-specific fetch/parse/metadata logic lives in **adapters** (`lib/rag/sources/`); everything downstream of a parsed document — change detection, the skip/metadata-only/full decision, chunking, embedding, persistence, and lifecycle marking — runs in the **shared core** (`ingestPreparedDocument` in `lib/rag/pipeline.ts`).

- An adapter produces a `PreparedDocument` (canonical/raw IDs, title, text, `lastSourceUpdate`, a `changeDetection` strategy, and a `buildMetadata` callback).
- The CLI scripts (`scripts/ingest-{notion,url}.ts`) and the admin manual ingestor (`lib/admin/manual-ingestor.ts`) are thin callers over the core; they share `withIngestRun` for run-level bookkeeping and an `IngestReporter` for progress (console vs. SSE).
- **Adding a new source type (e.g. PDF) means writing one adapter** — the chunk/embed/store path is reused unchanged.

---

## 2. Ingestion Sources

### Notion Pages

- **Adapter:** `lib/rag/sources/notion.ts` (`prepareNotionPageDocument`)
- **Tool:** `notion-client` (private API) to fetch `ExtendedRecordMap`.
- **Extraction:** Uses `notion-utils` to convert blocks to plain text (`extractPlainText` in `lib/rag/index.ts`).
- **Crawling:** Linked-page discovery lives in `lib/admin/manual-ingestor.ts`.
  - **Depth Control:** `LINKED_PAGE_MAX_DEPTH` (default: 4)
  - **Breadth Control:** `LINKED_PAGE_MAX_PAGES` (default: 250)
- **Change detection:** `hash` (Notion `last_edited_time` moves on any page touch, so content hash alone is authoritative).

### URLs

- **Adapter:** `lib/rag/sources/url.ts` (`fetchUrlDocument`) -> `extractMainContent` in `lib/rag/index.ts`
- **Tool:** `jsdom` + `@mozilla/readability`.
- **Extraction:** Scrapes HTML and isolates main article content, removing navigation/ads.
- **Change detection:** `hash-and-timestamp` (also compares `Last-Modified`).

---

## 3. Change Detection Policy

To strictly minimize unnecessary embedding costs, the system checks for changes _before_ processing content.

**Logic:** `decideIngestAction` in `lib/rag/ingest-helpers.ts`, invoked by the shared core (`ingestPreparedDocument`).

1.  **Content Hash:** Calculates `stableHash(canonicalId + plainText)`.
2.  **Last Modified:** Compares semantic `last_source_update` timestamps (only for the `hash-and-timestamp` strategy; see the per-source change-detection mode above).
3.  **Decision Tree:**
    - If **Content Hash Changed** → `full` ingest (delete old chunks, embed new).
    - If **Content Unchanged** BUT **Metadata Changed** → `metadata-only` update (update `rag_documents` table only).
    - If **Everything Unchanged** → `skip`.

---

## 4. Chunking & Tokenization

Chunking is performed in `lib/rag/index.ts` using a sliding window strategy to preserve semantic context across boundaries.

- **Tokenizer:** `gpt-tokenizer` (BPE).
- **Max Tokens:** `450`
- **Overlap:** `75`
- **Algorithm:** `chunkByTokens`
  1.  Split text into words.
  2.  Accumulate words until `currentTokens + wordTokens > maxTokens`.
  3.  Flush chunk.
  4.  Retain the last `N` tokens (defined by overlap) for the next chunk's start.

---

## 5. Embeddings & Persistence

The system isolates embedding vectors by provider and model version to prevent dimension mismatches.

### Isolation Strategy

- **Resolver:** `resolveEmbeddingSelection` (`lib/core/embedding-spaces.ts`) maps a provider (`openai`, `gemini`) to a specific config.
- **Storage:** Vectors are stored in partitioned tables, e.g.:
  - `rag_chunks_openai_te3s_v1` (OpenAI text-embedding-3-small)
  - `rag_chunks_gemini_te4_v1` (Gemini text-embedding-004)

### Atomic Updates

Updates uses a "replace-all" transaction pattern (`replaceChunks` in `lib/rag/index.ts`):

1.  **Identify:** Calculate new chunk hashes for the document.
2.  **Diff:** Compare with existing chunks in the DB for this `doc_id`.
3.  **Delete:** Remove chunks that are no longer present.
4.  **Upsert:** Insert new chunks.
    _Note: This ensures that a document is never partially updated or duplicated._

---

## 6. Data Model

### `rag_documents` (Metadata Store)

Canonical source of truth for document state.

- `doc_id` (PK): Normalized ID.
- `content_hash`: Used for change detection.
- `metadata`: JSONB blob (title, date, author, etc.).

### `rag_ingest_runs` (Observability)

Tracks the execution of ingestion jobs.

- `status`: `in_progress` | `success` | `failed`.
- `documents_processed`, `documents_added`, `documents_skipped`.
- `error_logs`: JSONB array of failures.
