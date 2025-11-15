-- Embedding space aware tables, views, and RPCs (v1)
-- This script renames legacy provider-specific tables to versioned
-- embedding space names and adds compatibility wrappers.

DO $$
BEGIN
  IF to_regclass('public.rag_chunks_openai_te3s_v1') IS NULL THEN
    IF to_regclass('public.rag_chunks_openai') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.rag_chunks_openai RENAME TO rag_chunks_openai_te3s_v1';
    END IF;
  END IF;

  IF to_regclass('public.rag_chunks_gemini_te4_v1') IS NULL THEN
    IF to_regclass('public.rag_chunks_gemini') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.rag_chunks_gemini RENAME TO rag_chunks_gemini_te4_v1';
    END IF;
  END IF;

  IF to_regclass('public.rag_chunks_hf_minilm_v1') IS NULL THEN
    IF to_regclass('public.rag_chunks_hf') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.rag_chunks_hf RENAME TO rag_chunks_hf_minilm_v1';
    END IF;
  END IF;
END$$;

-- Backward compatibility views for legacy table names
CREATE OR REPLACE VIEW public.rag_chunks_openai AS SELECT * FROM public.rag_chunks_openai_te3s_v1;
CREATE OR REPLACE VIEW public.rag_chunks_gemini AS SELECT * FROM public.rag_chunks_gemini_te4_v1;
CREATE OR REPLACE VIEW public.rag_chunks_hf AS SELECT * FROM public.rag_chunks_hf_minilm_v1;

-- LangChain-friendly chunk views (versioned by embedding space)
DROP VIEW IF EXISTS public.lc_chunks_openai_te3s_v1 CASCADE;
CREATE OR REPLACE VIEW public.lc_chunks_openai_te3s_v1 AS
SELECT
  CONCAT(r.doc_id, ':', r.chunk_hash) AS id,
  r.chunk AS content,
  jsonb_build_object(
    'doc_id', r.doc_id,
    'title', r.title,
    'source_url', r.source_url,
    'chunk_hash', r.chunk_hash,
    'ingested_at', r.ingested_at
  ) AS metadata,
  r.embedding
FROM public.rag_chunks_openai_te3s_v1 r;

DROP VIEW IF EXISTS public.lc_chunks_gemini_te4_v1 CASCADE;
CREATE OR REPLACE VIEW public.lc_chunks_gemini_te4_v1 AS
SELECT
  CONCAT(r.doc_id, ':', r.chunk_hash) AS id,
  r.chunk AS content,
  jsonb_build_object(
    'doc_id', r.doc_id,
    'title', r.title,
    'source_url', r.source_url,
    'chunk_hash', r.chunk_hash,
    'ingested_at', r.ingested_at
  ) AS metadata,
  r.embedding
FROM public.rag_chunks_gemini_te4_v1 r;

DROP VIEW IF EXISTS public.lc_chunks_hf_minilm_v1 CASCADE;
CREATE OR REPLACE VIEW public.lc_chunks_hf_minilm_v1 AS
SELECT
  CONCAT(r.doc_id, ':', r.chunk_hash) AS id,
  r.chunk AS content,
  jsonb_build_object(
    'doc_id', r.doc_id,
    'title', r.title,
    'source_url', r.source_url,
    'chunk_hash', r.chunk_hash,
    'ingested_at', r.ingested_at
  ) AS metadata,
  r.embedding
FROM public.rag_chunks_hf_minilm_v1 r;

-- Compatibility views to keep legacy LangChain view names working
CREATE OR REPLACE VIEW public.lc_chunks_openai AS SELECT * FROM public.lc_chunks_openai_te3s_v1;
CREATE OR REPLACE VIEW public.lc_chunks_gemini AS SELECT * FROM public.lc_chunks_gemini_te4_v1;
CREATE OR REPLACE VIEW public.lc_chunks_hf AS SELECT * FROM public.lc_chunks_hf_minilm_v1;

-- LangChain match functions (versioned)
DROP FUNCTION IF EXISTS public.match_lc_chunks_openai_te3s_v1(vector, integer, jsonb);
CREATE OR REPLACE FUNCTION public.match_lc_chunks_openai_te3s_v1(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.metadata,
    c.embedding,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.lc_chunks_openai_te3s_v1 c
  WHERE filter IS NULL
    OR filter = '{}'::jsonb
    OR c.metadata @> filter
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS public.match_lc_chunks_gemini_te4_v1(vector, integer, jsonb);
CREATE OR REPLACE FUNCTION public.match_lc_chunks_gemini_te4_v1(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.metadata,
    c.embedding,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.lc_chunks_gemini_te4_v1 c
  WHERE filter IS NULL
    OR filter = '{}'::jsonb
    OR c.metadata @> filter
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS public.match_lc_chunks_hf_minilm_v1(vector, integer, jsonb);
CREATE OR REPLACE FUNCTION public.match_lc_chunks_hf_minilm_v1(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.metadata,
    c.embedding,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.lc_chunks_hf_minilm_v1 c
  WHERE filter IS NULL
    OR filter = '{}'::jsonb
    OR c.metadata @> filter
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Legacy LangChain match wrappers (pointed to versioned functions)
CREATE OR REPLACE FUNCTION public.match_lc_chunks_openai(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
) LANGUAGE sql AS $$
  SELECT * FROM public.match_lc_chunks_openai_te3s_v1(query_embedding, match_count, filter);
$$;

CREATE OR REPLACE FUNCTION public.match_lc_chunks_gemini(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
) LANGUAGE sql AS $$
  SELECT * FROM public.match_lc_chunks_gemini_te4_v1(query_embedding, match_count, filter);
$$;

CREATE OR REPLACE FUNCTION public.match_lc_chunks_hf(
  query_embedding vector,
  match_count integer DEFAULT 5,
  filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
) LANGUAGE sql AS $$
  SELECT * FROM public.match_lc_chunks_hf_minilm_v1(query_embedding, match_count, filter);
$$;

-- Embedding-space match functions (native RAG)
DROP FUNCTION IF EXISTS public.match_chunks_openai_te3s_v1(vector, double precision, integer);
CREATE OR REPLACE FUNCTION public.match_chunks_openai_te3s_v1(
  query_embedding vector,
  similarity_threshold double precision DEFAULT 0.78,
  match_count integer DEFAULT 5
) RETURNS TABLE (
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CONCAT(r.doc_id, ':', r.chunk_hash) AS id,
    r.doc_id,
    r.source_url,
    r.title,
    r.chunk,
    r.chunk_hash,
    r.ingested_at,
    r.embedding,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM public.rag_chunks_openai_te3s_v1 r
  WHERE similarity_threshold IS NULL
    OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS public.match_chunks_gemini_te4_v1(vector, double precision, integer);
CREATE OR REPLACE FUNCTION public.match_chunks_gemini_te4_v1(
  query_embedding vector,
  similarity_threshold double precision DEFAULT 0.78,
  match_count integer DEFAULT 5
) RETURNS TABLE (
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CONCAT(r.doc_id, ':', r.chunk_hash) AS id,
    r.doc_id,
    r.source_url,
    r.title,
    r.chunk,
    r.chunk_hash,
    r.ingested_at,
    r.embedding,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM public.rag_chunks_gemini_te4_v1 r
  WHERE similarity_threshold IS NULL
    OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS public.match_chunks_hf_minilm_v1(vector, double precision, integer);
CREATE OR REPLACE FUNCTION public.match_chunks_hf_minilm_v1(
  query_embedding vector,
  similarity_threshold double precision DEFAULT 0.78,
  match_count integer DEFAULT 5
) RETURNS TABLE (
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CONCAT(r.doc_id, ':', r.chunk_hash) AS id,
    r.doc_id,
    r.source_url,
    r.title,
    r.chunk,
    r.chunk_hash,
    r.ingested_at,
    r.embedding,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM public.rag_chunks_hf_minilm_v1 r
  WHERE similarity_threshold IS NULL
    OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS public.match_rag_chunks_openai(vector, double precision, integer);
CREATE OR REPLACE FUNCTION public.match_rag_chunks_openai(
  query_embedding vector,
  similarity_threshold double precision DEFAULT 0.78,
  match_count integer DEFAULT 5
) RETURNS TABLE (
  id text,
  doc_id text,
  source_url text,
  title text,
  chunk text,
  chunk_hash text,
  ingested_at timestamptz,
  embedding vector,
  similarity double precision
) LANGUAGE sql AS $$
  SELECT * FROM public.match_chunks_openai_te3s_v1(query_embedding, similarity_threshold, match_count);
$$;

DROP FUNCTION IF EXISTS public.match_rag_chunks_gemini(vector, double precision, integer);
CREATE OR REPLACE FUNCTION public.match_rag_chunks_gemini(
  query_embedding vector,
  similarity_threshold double precision DEFAULT 0.78,
  match_count integer DEFAULT 5
) RETURNS TABLE (
  id text,
  doc_id text,
  source_url text,
  title text,
  chunk text,
  chunk_hash text,
  ingested_at timestamptz,
  embedding vector,
  similarity double precision
) LANGUAGE sql AS $$
  SELECT * FROM public.match_chunks_gemini_te4_v1(query_embedding, similarity_threshold, match_count);
$$;

DROP FUNCTION IF EXISTS public.match_rag_chunks_hf(vector, double precision, integer);
CREATE OR REPLACE FUNCTION public.match_rag_chunks_hf(
  query_embedding vector,
  similarity_threshold double precision DEFAULT 0.78,
  match_count integer DEFAULT 5
) RETURNS TABLE (
  id text,
  doc_id text,
  source_url text,
  title text,
  chunk text,
  chunk_hash text,
  ingested_at timestamptz,
  embedding vector,
  similarity double precision
) LANGUAGE sql AS $$
  SELECT * FROM public.match_chunks_hf_minilm_v1(query_embedding, similarity_threshold, match_count);
$$;
