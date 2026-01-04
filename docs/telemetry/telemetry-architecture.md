# Telemetry & Observability Architecture

This document provides a ground-truth analysis of the observability stack for the AI Platform. It details how the system monitors itself, tracks quality, and ensures safe operations.

## 1. Telemetry Architecture

The system uses a **Dual-Telemetry Strategy** to separate engineering debug data from product usage analytics.

### A. Langfuse (LLM Engineering Observability)

- **Purpose:** Deep tracing of the LLM chain of thought, latency waterfalls, and cost tracking.
- **Implementation:** `lib/server/telemetry/telemetry-buffer.ts`
- **Data Model:**
  - **Trace:** Maps 1:1 with a Chat Request (`requestId`).
  - **Span:** Tracks individual stages (e.g., `rag-retrieval`, `llm-generation`).
  - **Tags:** Standardized via `langfuse-tags.ts` to include `intent`, `preset`, and `env`.
- **Privacy:** PII (Personally Identifiable Information) in prompts is masked by default unless `LANGFUSE_INCLUDE_PII=true` is set.

### B. PostHog (Product Analytics)

- **Purpose:** User behavior tracking, retention cohorts, and high-level feature usage.
- **Implementation:** `lib/logging/client.ts`
- **Integration:**
  - Client-side events (clicks, page views) used for funnel analysis.
  - Server-side events logged via shared loggers when critical business logic executes (e.g., "Ingestion Started").

### C. Unified Logging Layer

- **Implementation:** `lib/logging/logger.ts`
- **Design:** A hierarchical logger that routes messages based on domain (`rag`, `ingestion`, `notion`, `externalLLM`).
- **Dynamic Configuration:** Log levels can be adjusted live via environment variables (e.g., `LOG_RAG_LEVEL=debug`) without code changes.

---

## 2. RAG Quality Signals

The system actively monitors the quality of retrieval to trigger self-correction mechanisms (Auto-RAG).

### A. Weak Retrieval Detection

- **Logic:** Defined in `lib/server/api/langchain_chat_impl_heavy.ts`.
- **Trigger:** If the highest similarity score of retrieved chunks is below `similarityThreshold` (default: 0.78).
- **Signal:** Logs a `weak-retrieval` event which triggers the **Auto-RAG** workflow (Hypothetical Document Embeddings or Query Rewriting).

### B. Auto-RAG Telemetry

- **Decision Logging:** Every RAG execution logs a `decisionSignature` containing:
  - `search_intent`: Whether the query required external knowledge.
  - `retrieval_strategy`: The chosen path (e.g., `native`, `langchain`, `rewritten`).
  - `outcome`: Whether the fallback provided better chunks.

---

## 3. Snapshot & Health Monitoring

Long-term system health is tracked via SQL-based snapshots in Supabase.

### A. `rag_snapshot` Table

Captures the state of the knowledge base at the end of every ingestion run.

- **Metrics:** `total_documents`, `total_chunks`, `total_characters`.
- **Deltas:** `delta_documents` (growth since last run).
- **Health:** `error_count`, `queue_depth`.

### B. `rag_ingest_runs` Table

An audit log of every attempt to update the knowledge base.

- **Status:** `success`, `failed`, `completed_with_errors`.
- **Duration:** `duration_ms` for performance trending.
- **Type:** Tracks `full` (re-index) vs `partial` (incremental) runs.

---

## 4. Caching & Performance Signals

Performance is monitored to balance cost/latency against freshness.

### A. Retrieval Caching

- **Layer:** `lib/server/chat-cache.ts` (In-memory LRU).
- **Key:** Composed of `question_hash`, `preset_id`, `top_k`, and `user_id`.
- **Telemetry:**
  - `cache_hit`: Recorded in trace metadata.
  - `latency_saved`: Implicitly measured by comparing cached vs uncached duration.

### B. Diagnostics Headers

- **`X-Guardrail-Meta`**: A response header returned to the client containing safe metadata (e.g., `retrieval_score`, `model_name`) for the Admin Debug Dashboard.

---

## 5. Governance & Change Safety

### A. Versioned Embedding Tables

To allow safe model upgrades, vector tables are suffix-versioned:

- `rag_chunks_openai_te3s_v1` (OpenAI Text-Embedding-3-Small)
- `rag_chunks_gemini_te4_v1` (Gemini Text-Embedding-004)
- **Mechanism:** Code selects the table based on the active configuration, allowing A/B testing of new embedding models without downtime.

### B. Feature Flags

- **`SAFE_MODE`**: A runtime entry in `computRagContext` that disables external tools/retrieval.
- **Environment Variables:** Control critical thresholds (`RAG_TOP_K`, `SIMILARITY_THRESHOLD`) ensuring operational tuning doesn't require deployment.

---
