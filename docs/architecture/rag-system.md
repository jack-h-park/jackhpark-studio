# RAG System (System Design)

This document outlines the architecture of the RAG system designed to ground the AI Chat Assistant in authoritative portfolio content.

Unlike simple "vector lookup" implementations, this system treats retrieval as a fallible process that must be actively managed, audited, and self-corrected before context reaches the LLM.

## Canonical Contract

**Status:** Canonical  
**Defines:**
- the end-to-end RAG architecture covering ingestion, retrieval, and context assembly.
- the Auto-RAG decision policy, including quality checks, HyDE, query rewriting, and multi-query fusion.
- the context assembly and citation guarantees, with dedupe/quota rules that determine what reaches the LLM.
- ingestion hygiene (change detection, chunking, embedding versioning) that feeds authoritative signals.
**Invariants:**
- Auto-RAG remains a managed capability (not a forced override) that only triggers when the base retrieval is weak.
- Retrieved context must obey the sliding-window chunk quotas, deduplication, and citation guarantees before prompt assembly.
- Embedding storage stays partitioned by provider/model and ingestion keeps change detection, dedupe, and atomic replacement intact.
**Derived documents:**
- [rag-architecture.md](./rag-architecture.md)
- [rag-retrieval-engine.md](./rag-retrieval-engine.md)
- [rag-ingestion-pipeline.md](./rag-ingestion-pipeline.md)
- [analysis/memory-implementation-analysis.md](../analysis/memory-implementation-analysis.md)
**Change rule:** If this contract changes, update derived docs in the same PR.

---

## 1. High-Level Architecture

The system operates on two decoupled pipelines: a **Push-based Ingestion Pipeline** (Write Path) and a **Self-Correcting Retrieval Engine** (Read Path).

- **Ingestion:** Focuses on data hygiene, normalization, and atomic updates. It ensures that the vector store reflects the current state of authoritative sources (Notion, External URLs) without duplication or stale states.
- **Retrieval:** Focuses on semantic alignment. It acknowledges that user queries are often ambiguous, employing an "Auto-RAG" decision tree to rewrite or expand queries when initial retrieval quality is low.

The vector store is built on **Supabase + pgvector**, chosen to keep vector text closely coupled with relational metadata (permissions, authorship, last modified dates) in a single transactional layer.

---

## 2. Ingestion & ETL

The ingestion pipeline is designed to be idempotent and cost-efficient. It prevents "embedding drift" where re-running an ingestion job unnecessarily burns tokens or creates duplicate vectors.

### Sources & Crawling

The system supports two primary inputs:

- **Notion:** Recursively crawls page trees using the private Notion API. It handles nested child pages (depth-controlled) to capture full project hierarchies.
- **Web URLs:** Uses a headless extraction layer (`jsdom` + `Readability`) to strip chrome (ads, navigation) and isolate the semantic article body.

### Change Detection Policy

To minimize embedding costs, the system calculates a stable hash of the normalized content (`canonical_id` + `plain_text`) before processing.

- **Unchanged Content:** Skipped entirely.
- **Metadata-Only Changes:** Updates the relational `rag_documents` table without touching the vector store.
- **Content Changes:** Triggers a "Full Ingest" — an atomic delete-and-replace operation for all chunks belonging to that document ID.

---

## 3. Chunking & Tokenization Strategy

Simple character splitting often severs semantic meaning (e.g., cutting a sentence in half). This system uses a **Sliding Window** strategy backed by a BPE tokenizer (`gpt-tokenizer`) to align with LLM context windows.

- **Window Size:** `450 tokens`. Large enough to capture a coherent thought or paragraph.
- **Overlap:** `75 tokens`. Ensures that key terms at the boundaries of chunks are not lost, providing continuity for the retrieval model.

This specific ratio (6:1) balances granularity (finding specific facts) with cohesiveness (providing enough context for the LLM to reason).

---

## 4. Embedding Strategy & Vector Persistence

The system is designed for model agility, supporting multiple embedding providers simultaneously without data corruption.

### Isolation & Versioning

Embedding vectors are stored in isolated, versioned tables partitioned by provider and model dimension:

- `rag_chunks_openai_te3s_v1` (1536d)
- `rag_chunks_gemini_te4_v1` (768d)

This allows the system to switch providers (e.g., for cost or latency reasons) or A/B test new models without requiring a full database migration.

### Vector Storage (Supabase)

We utilize `pgvector` with `ivfflat` indexing.
**Design Decision:** While specialized vector databases (Pinecone, Weaviate) offer advanced features, Postgres was chosen because:

1.  **Metadata Filtering:** RAG queries heavily rely on relational filtering (e.g., "only search `blog_posts` from `2024`"). Doing this in Postgres is a single-query operation.
2.  **Atomic Consistency:** Deleting a document removes its metadata _and_ vectors in the same transaction, preventing "zombie vectors" common in decoupled systems.

---

## 5. Retrieval Engine (The “Brain”)

The core differentiator of this system is **Auto-RAG**. We assume that a single cosine similarity search is often insufficient for complex user queries.

### The Auto-RAG Decision Tree

Every retrieval request flows through a multi-pass evaluation logic:

1.  **Base Pass:** execute standard vector search.
2.  **Quality Check:** The system analyzes the results for "Weakness":
    - Are there zero matches?
    - Is the highest similarity score below the strict threshold (0.78)?
    - Is the result density low (fewer than 3 matches)?
3.  **Self-Correction:** If weak, the system automatically escalates:
    - **HyDE (Hypothetical Document Embedding):** The LLM hallucinates a theoretical answer, which is then embedded to find semantically similar real chunks.
    - **Query Rewriting:** The LLM simplifies or expands the user's query to target better search terms.
4.  **Multi-Query Fusion:** In high-ambiguity modes, the system runs parallel searches for multiple query variations and merges the results using Reciprocal Rank Fusion.

This "Loop" ensures that the RAG system fights hard to find relevant context before giving up.

---

## 6. Context Assembly & Citations

Retrieving chunks is only half the battle; they must be presented effectively to the LLM.

### Deduplication

Because we use sliding window chunking, retrieved chunks often meaningless overlap. The assembly layer detects overlapping text ranges and merges them into a single, continuous context block. This increases the "information density" of the prompt, allowing more unique facts to fit within the `ragContextTokenBudget`.

### Citation Guarantee

To prevent hallucinations, the system enforces a strict contract: **If a chunk is used in the context, it must have a citation.**
The system generates a `Citations` payload alongside the prompt, mapping every sentence of context back to its source URL and Title. This allows the UI to render verifiable footnotes.

---

## 7. Design Trade-offs & Constraints

- **Latency vs. Accuracy:** The **Auto-RAG** loop introduces latency (multi-pass generation and search). We accept this trade-off because confident hallucinations are more damaging than a 500ms delay in a portfolio assistant context.
- **Storage Normalization:** Splitting metadata (`rag_documents`) from vectors (`rag_chunks`) complicates writes but dramatically simplifies reads and analytics.
- **Ingestion Freshness:** This is a "Pull" system (triggered indexing) rather than "Push" (webhook-driven). This means there is a delay between a Notion edit and its availability in chat. For this application scope, eventual consistency is acceptable.

---

## 8. Observability Bridge (Toward Project 3)

While metrics are out of scope for this document, the system is designed to be observed.

- **Run Logs:** Every ingestion job is logged to `rag_ingest_runs` with granular error details.
- **Snapshots:** The `rag_snapshot` table captures daily volume metrics.
- **Traceability:** Every retrieval decision (Base vs Auto, Hybrid vs Native) is tagged in the implementation, allowing the Governance system (Project 3) to strictly audit "Why did the bot choose this answer?".
