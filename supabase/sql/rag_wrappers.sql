-- Wrapper functions that expose a stable RAG RPC surface while keeping the versioned
-- helpers isolated. These simply delegate to the existing *_v1 match functions.

CREATE OR REPLACE FUNCTION public.match_rag_chunks_native_openai(
  query_embedding vector,
  match_count integer DEFAULT 5,
  similarity_threshold double precision DEFAULT 0.78,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id text,
  doc_id text,
  source_url text,
  title text,
  chunk text,
  chunk_hash text,
  ingested_at timestamptz,
  embedding vector,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.match_native_chunks_openai_te3s_v1(
    query_embedding      => query_embedding,
    similarity_threshold => similarity_threshold,
    match_count          => match_count,
    filter               => filter
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.match_rag_chunks_native_gemini(
  query_embedding vector,
  match_count integer DEFAULT 5,
  similarity_threshold double precision DEFAULT 0.78,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id text,
  doc_id text,
  source_url text,
  title text,
  chunk text,
  chunk_hash text,
  ingested_at timestamptz,
  embedding vector,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.match_native_chunks_gemini_te4_v1(
    query_embedding      => query_embedding,
    similarity_threshold => similarity_threshold,
    match_count          => match_count,
    filter               => filter
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.match_rag_chunks_langchain_openai(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.match_langchain_chunks_openai_te3s_v1(
    query_embedding => query_embedding,
    match_count     => match_count,
    filter          => filter
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.match_rag_chunks_langchain_gemini(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.match_langchain_chunks_gemini_te4_v1(
    query_embedding => query_embedding,
    match_count     => match_count,
    filter          => filter
  );
END;
$$;
