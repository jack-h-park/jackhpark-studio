# RAG Retrieval Engine

> **Derives from canonical:** [RAG System](../../canonical/rag/rag-system.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

**Status:** authoritative
**Implementations:** `lib/server/api/langchain_chat_impl_heavy.ts`, `lib/rag/retrieval.ts`, `lib/rag/ranking.ts`

This document details the **Read Path** of the RAG system: how the Chat Assistant retrieves, ranks, and assembles context from the vector store.  
Refer to [RAG System](../../canonical/rag/rag-system.md) for the canonical [Auto-RAG](../00-start-here/terminology.md#auto-rag) policy and context invariants; this page covers implementation specifics.

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

The canonical [Auto-RAG](../00-start-here/terminology.md#auto-rag) decision tree is described in `rag-system.md`. Here we document the implementation surfaces lit by `computeRagContextAndCitations`:

- **Base pass:** `match_*` RPCs execute a similarity search and `isWeakRetrieval` validates `similarityThreshold`, match count, and density. The resulting candidates flow into `buildContextWindow`.
- **Auto correction:** When `isWeakRetrieval` is true, the handler invokes `generateHydeDocument` and `rewriteQuery` before re-running the retrieval pass; `scoreDecision` compares base vs auto sets and decides which list to keep.
- **Multi-query fusion:** When `ragMultiQueryMode` is enabled, `mergeCandidates` runs parallel queries with alternative rewrites and performs Reciprocal Rank Fusion before selection.
- **Telemetry hooks:** `rag:root`, `context:selection`, and Langfuse `rag_retrieval_stage` spans annotate every pass (`autoTriggered`, `winner`, `multiQueryRan`, `insufficient`) and expose `decisionSignature`/score metrics for dashboards.

Implementation respects guardrail flags: when guardrails or presets set `reverseRAG` or `hyde`, `resolveAutoMode` forcibly routes requests down the requested path before `isWeakRetrieval` runs. See `guardrail-system.md` for the policy semantics that govern those overrides.

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
