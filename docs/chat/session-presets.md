# Session Presets

> **Derives from canonical:** [Chat Guardrail System](../canonical/guardrails/guardrail-system.md)
> This document is role-specific; it must not redefine the canonical invariants.
> If behavior changes, update the canonical doc first, then reflect here.

The guardrail contract defines which presets are allowed and what invariants they must honor. This document enumerates the `sessionConfig` values that satisfy those constraints.

## Precision
Precision is for high-accuracy answers when you care about correctness more than recall. The system prioritizes tight similarity windows and short context windows so the model leans on the most relevant chunks.

- **Additional system prompt:** "Answer concisely and accurately. Avoid speculation. Use retrieved context only when it clearly improves correctness."
- **LLM model:** OpenAI `gpt-4o`
- **Embedding model:** OpenAI text-embedding (default `text-embedding-3-small`)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 4
- **Similarity threshold:** 0.55
- **[Reverse RAG](../00-start-here/terminology.md#reverse-rag):** false
- **[HyDE](../00-start-here/terminology.md#hyde):** false
- **Reranker:** none
- **Summary level:** off
- **Context history enabled:** true
- **Token budget:** 2048
- **History budget:** 768
- **Clip tokens:** 128

## Default (Balanced)
Balanced (Default) stays accurate without severely limiting recall. It matches Precision’s safety prompt but lets the retriever pull a slightly wider window and keeps a moderate history budget.

- **Additional system prompt:** "Answer concisely and accurately. Avoid speculation. Use retrieved context only when it clearly improves correctness."
- **LLM model:** OpenAI `gpt-4o`
- **Embedding model:** OpenAI text-embedding (default `text-embedding-3-small`)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 6
- **Similarity threshold:** 0.40
- **[Reverse RAG](../00-start-here/terminology.md#reverse-rag):** false
- **[HyDE](../00-start-here/terminology.md#hyde):** false
- **Reranker:** none
- **Summary level:** low
- **Context history enabled:** true
- **Token budget:** 2048
- **History budget:** 1024
- **Clip tokens:** 128

## High Recall
- High Recall is tuned for large, exploratory inquiries. [Reverse RAG](../00-start-here/terminology.md#reverse-rag) is enabled so retrieval can search broadly, and a lightweight reranker (MMR) protects precision as the retriever climbs to `topK=12`.

- **Additional system prompt:** "Prioritize completeness and coverage. It is acceptable to include multiple perspectives or partially relevant context if it improves recall."
- **LLM model:** OpenAI `gpt-4o`
- **Embedding model:** OpenAI text-embedding (default `text-embedding-3-small`)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 12
- **Similarity threshold:** 0.30
- **[Reverse RAG](../00-start-here/terminology.md#reverse-rag):** true
- **[HyDE](../00-start-here/terminology.md#hyde):** false
- **Reranker:** mmr
- **Summary level:** medium
- **Context history enabled:** true
- **Token budget:** 3072
- **History budget:** 1536
- **Clip tokens:** 256

## Fast
Fast is for latency-sensitive use cases. It leans on the smaller `gpt-4o-mini` family and short retrieval/context budgets.

- **Additional system prompt:** "Focus on speed and brevity. Prefer short, direct answers. Avoid unnecessary explanations or deep reasoning."
- **LLM model:** OpenAI `gpt-4o-mini`
- **Embedding model:** OpenAI text-embedding (default `text-embedding-3-small`)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 3
- **Similarity threshold:** 0.35
- **[Reverse RAG](../00-start-here/terminology.md#reverse-rag):** false
- **[HyDE](../00-start-here/terminology.md#hyde):** false
- **Reranker:** none
- **Summary level:** low
- **Context history enabled:** true
- **Token budget:** 1536
- **History budget:** 512
- **Clip tokens:** 64

Refer to [Guardrail System](../canonical/guardrails/guardrail-system.md) for the policy that enforces which presets can enable [HyDE](../00-start-here/terminology.md#hyde), [Reverse RAG](../00-start-here/terminology.md#reverse-rag), and budget controls, and to [RAG System](../canonical/rag/rag-system.md) for the broader Auto-RAG guarantees those presets must respect.
