# RAG Ingestion Pipeline

**Status:** authoritative
**Implementations:** `lib/admin/manual-ingestor.ts`, `lib/rag/index.ts`

This document details the **Write Path** of the RAG system: how data is fetched, processed, chunked, and stored in the vector database.

---

## 1. Overview

The ingestion system follows a "push" model triggered via the Admin UI or scripts. It supports two primary strategies:

1.  **Atomic Document Updates:** Replaces all chunks for a document if its content hash changes.
2.  **Versioning:** Supports multiple embedding providers (OpenAI, Gemini) concurrently via isolated tables.

---

## 2. Ingestion Sources

### Notion Pages

- **Source:** `lib/admin/manual-ingestor.ts`
- **Tool:** `notion-client` (private API) to fetch `ExtendedRecordMap`.
- **Extraction:** Uses `notion-utils` to convert blocks to plain text.
- **Crawling:** Supports recursive ingestion of linked pages.
  - **Depth Control:** `LINKED_PAGE_MAX_DEPTH` (default: 4)
  - **Breadth Control:** `LINKED_PAGE_MAX_PAGES` (default: 250)

### URLs

- **Source:** `lib/rag/index.ts` -> `extractMainContent`
- **Tool:** `jsdom` + `@mozilla/readability`.
- **Extraction:** Scrapes HTML and isolates main article content, removing navigation/ads.

---

## 3. Change Detection Policy

To strictly minimize unnecessary embedding costs, the system checks for changes _before_ processing content.

**Logic:** `lib/rag/ingest-helpers.ts`

1.  **Content Hash:** Calculates `stableHash(canonicalId + plainText)`.
2.  **Last Modified:** Compares semantic `last_source_update` timestamps.
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
