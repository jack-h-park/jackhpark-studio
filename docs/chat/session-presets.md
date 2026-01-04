# Session Presets

These presets are the pre-packaged `sessionConfig` values the chat runtime falls back to when the database lacks admin-configured overrides. Each preset encodes a different balance of accuracy, coverage, and latency while keeping retrieval, HyDE, and Reverse RAG under server control.

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
- **Reverse RAG:** false
- **HyDE:** false
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
- **Reverse RAG:** false
- **HyDE:** false
- **Reranker:** none
- **Summary level:** low
- **Context history enabled:** true
- **Token budget:** 2048
- **History budget:** 1024
- **Clip tokens:** 128

## High Recall
High Recall is tuned for large, exploratory inquiries. Reverse RAG is enabled so retrieval can search broadly, and a lightweight reranker (MMR) protects precision as the retriever climbs to `topK=12`.

- **Additional system prompt:** "Prioritize completeness and coverage. It is acceptable to include multiple perspectives or partially relevant context if it improves recall."
- **LLM model:** OpenAI `gpt-4o`
- **Embedding model:** OpenAI text-embedding (default `text-embedding-3-small`)
- **Require local backend:** false
- **Safe mode:** false
- **Retrieval enabled:** true
- **RAG top K:** 12
- **Similarity threshold:** 0.30
- **Reverse RAG:** true
- **HyDE:** false
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
- **Reverse RAG:** false
- **HyDE:** false
- **Reranker:** none
- **Summary level:** low
- **Context history enabled:** true
- **Token budget:** 1536
- **History budget:** 512
- **Clip tokens:** 64

## Notes on HyDE and Reverse RAG
HyDE is off by default because turning it on effectively forces the system to inject synthetic context via the model; keeping it disabled ensures we never preempt Auto-RAG heuristics with a reconstructed prompt. Reverse RAG stays disabled outside High Recall so the retriever normally obeys the Auto-RAG safety checks and doesn’t always rewrite the query into a costly deep search.

## Auto-RAG & retrieval behavior
Each preset controls the values that feed into `loadChatModelSettings`, so the runtime always knows which retrieval strength, budgets, and reranking strategy to enforce, even if the database is empty. Auto-RAG still evaluates the same signals (e.g., query intent, guardrails, and retriever confidence) but works within the preset’s guardrails: reverse RAG is enabled only in High Recall, HyDE is opt-in via admin config, and budgets are capped so Auto-RAG cannot inflate context beyond the preset’s ceilings.
