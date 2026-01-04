# RAG Retrieval Engine

**Status:** authoritative
**Implementations:** `lib/server/api/langchain_chat_impl_heavy.ts`, `lib/rag/retrieval.ts`, `lib/rag/ranking.ts`

This document details the **Read Path** of the RAG system: how the Chat Assistant retrieves, ranks, and assembles context from the vector store.

---

## 1. Vector Search Architecture

Retrieval is executed via Postgres RPC functions that wrap `pgvector` operators.

### RPC Functions

- **Files:** `db/schema/schema.latest.sql`
- **Naming Convention:** `match_[native|langchain]_chunks_[provider]_[model]`
- **Logic:**
  - Input: `query_embedding`, `similarity_threshold`, `match_count`.
  - Operation: Cosine distance (`1 - (embedding <=> query_embedding)`).
  - Filter: Applies JSONB filtering on `metadata` if provided.

---

## 2. Auto-RAG (Self-Correcting Retrieval)

The system is not a simple "top-k" lookup. It implements a multi-pass decision tree to handle complex or ambiguous queries.

**Logic:** `computeRagContextAndCitations` in `langchain_chat_impl_heavy.ts`

### Phase 1: Base Pass

- Executes a standard vector search using the user's raw query.
- **Evaluation:** Checks `isWeakRetrieval(result)`:
  - **Insufficient:** Zero matches found.
  - **Low Score:** Top match is below `similarityThreshold`.
  - **Low Count:** Fewer than `AUTO_MIN_INCLUDED` (3) chunks found.

### Phase 2: Auto-Correction (If Weak)

If the base pass is weak, the system triggers **Auto Mode**:

1.  **HyDE (Hypothetical Document Embeddings):** Generates a hypothetical answer to the user's question and embeds _that_ to find semantically similar chunks.
2.  **Query Rewriting:** Uses the LLM to rewrite the query for better search terms.
3.  **Comparision:** The system runs a second retrieval pass with the new embedding and picks the winner (`base` vs `auto`) based on score and density.

### Phase 3: Multi-Query (Optional)

If `ragMultiQueryMode` is enabled and base results are still weak:

- Generates multiple variations of the query.
- Executes parallel searches.
- **Fusion:** Merges results using Reciprocal Rank Fusion (RRF) or simple deduplication (`mergeCandidates`).

---

## 3. Ranking & Scoring

Raw vector similarity is weighted by business logic to prioritize high-value content.

**Logic:** `lib/rag/ranking.ts`

### Weight Multipliers

The final relevance score is modulated by `DocType` and `PersonaType` metadata:

- **Profile/Projects:** `1.15x` (Highest priority)
- **KB Articles:** `1.10x`
- **Blog Posts:** `1.00x`
- **Photos:** `0.30x` (Deprioritized)

---

## 4. Context Assembly

Once chunks are retrieved and ranked, they are assembled into the final prompt context.

### Deduplication

To maximize the "information density" of the context window:

- **Overlapping Chunks:** If two retrieved chunks overlap significantly (due to sliding window ingestion), they are merged into a single continuous block.
- **Repeats:** Identical text segments are removed.

### Budgeting

- **Hard Limit:** `ragContextTokenBudget` (default ~4000 tokens).
- **Selection:** Top matching chunks are added greedily until the budget is filled.

### Citation construction

- Every used chunk is mapped to a `Citation` object.
- **Guarantee:** If a chunk contributes to the context, its source URL and Title are guaranteed to appear in the citation list returned to the UI.
