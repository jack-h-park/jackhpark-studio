# Canonical Terminology

## Purpose
This document defines the canonical meaning of terms used across the system.
Other documents MUST NOT redefine these terms.

---

## Auto-RAG
**Canonical meaning:** The system’s self-correcting retrieval policy that evaluates base passes, HyDE, Reverse RAG, and multi-query before building context.  
**Scope:** System / Runtime  
**Used in:** `rag-system.md`, retrieval engine docs, telemetry instrumentation  
**Notes:** Governs whether advanced retrieval strategies run automatically when retrieval appears weak.

---

## Auto Mode
**Canonical meaning:** The UI label that exposes the Auto-RAG capability to users (enabling/disabling its considerations).  
**Scope:** UX / Settings  
**Used in:** `chat/advanced-settings-ux.md`, `analysis/advanced-settings-ownership-audit.md`, `operations/chat-user-guide.md`  
**Notes:** Enabling Auto Mode grants capability but never forces execution; force remains request-scoped.

---

## Auto-Pilot (Auto-RAG)
**Canonical meaning:** User-facing alias for Auto-RAG that explains the runtime’s self-correcting behavior.  
**Scope:** UX copy  
**Used in:** `operations/chat-user-guide.md`, `chat/session-presets.md`  
**Notes:** Must always appear with “(Auto-RAG)” on first mention to keep the linkage clear.

---

## Safe Mode
**Canonical meaning:** The preset or UI guardrail that disables retrieval, tools, and advanced enhancements.  
**Scope:** UX / Configuration  
**Used in:** `guardrail-system.md`, `chat/session-presets.md`, `operations/chat-user-guide.md`  
**Notes:** Applies canonical budget clamps and retrieval bypass rules when enabled.

---

## safe_mode
**Canonical meaning:** The telemetry/internal boolean flag emitted in traces/logs when Safe Mode is active.  
**Scope:** Telemetry / Implementation  
**Used in:** `telemetry/implementation/telemetry-logging.md`, Langfuse guides  
**Notes:** Used only within logs/traces; it is the data-plane reflection of the UI-level Safe Mode flag.

---

## Reverse RAG
**Canonical meaning:** A retrieval strategy that rewrites or reverses the query to improve recall.  
**Scope:** System / Policy  
**Used in:** `guardrail-system.md`, `chat/session-presets.md`, retrieval engine docs  
**Notes:** Capability must be enabled by preset/admin policy; forcing Reverse RAG is only allowed via request-scoped overrides that bypass Auto-RAG checks.

---

## HyDE (Hypothetical Document Embeddings)
**Canonical meaning:** A retrieval strategy that embeds a hypothetical answer produced by the LLM to ground context.  
**Scope:** System / Policy  
**Used in:** `guardrail-system.md`, `chat/session-presets.md`, retrieval engine docs  
**Notes:** Like Reverse RAG, HyDE must be enabled via capability; forcing it is request-scoped only.

---

## Capability vs Force
**Canonical meaning:** Capability denotes the permission to run an enhancement when Auto-RAG deems it necessary; Force means executing it regardless of retrieval quality.  
**Scope:** Policy / Guardrails  
**Used in:** `guardrail-system.md`, `advanced-settings-ownership-audit.md`, runtime docs  
**Notes:** Force flags are request-scoped and never persisted; capability toggles merely permit Auto-RAG to consider running the step.
