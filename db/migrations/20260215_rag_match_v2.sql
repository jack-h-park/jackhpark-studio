CREATE OR REPLACE FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"(
  "query_embedding" "extensions"."vector",
  "match_count" integer DEFAULT 5,
  "filter" "jsonb" DEFAULT '{}'::"jsonb"
) RETURNS TABLE(
  "id" "text",
  "content" "text",
  "metadata" "jsonb",
  "embedding" "extensions"."vector",
  "similarity" double precision
)
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      c.id,
      c.content,
      c.metadata,
      c.embedding,
      1 - (c.embedding <=> query_embedding) AS similarity
    FROM public.lc_chunks_gemini_te4_v1 c
    JOIN public.rag_documents d
      ON d.doc_id = (c.metadata->>'doc_id')
    WHERE d.status = 'active'
      AND (
        filter IS NULL
        OR filter = '{}'::jsonb
        OR c.metadata @> filter
      )
    ORDER BY c.embedding <=> query_embedding
    LIMIT (match_count * 3)
  ) AS ranked
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"(
  "query_embedding" "extensions"."vector",
  "match_count" integer DEFAULT 5,
  "filter" "jsonb" DEFAULT '{}'::"jsonb"
) RETURNS TABLE(
  "id" "text",
  "content" "text",
  "metadata" "jsonb",
  "embedding" "extensions"."vector",
  "similarity" double precision
)
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      c.id,
      c.content,
      c.metadata,
      c.embedding,
      1 - (c.embedding <=> query_embedding) AS similarity
    FROM public.lc_chunks_openai_te3s_v1 c
    JOIN public.rag_documents d
      ON d.doc_id = (c.metadata->>'doc_id')
    WHERE d.status = 'active'
      AND (
        filter IS NULL
        OR filter = '{}'::jsonb
        OR c.metadata @> filter
      )
    ORDER BY c.embedding <=> query_embedding
    LIMIT (match_count * 3)
  ) AS ranked
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."match_native_chunks_gemini_te4_v2"(
  "query_embedding" "extensions"."vector",
  "similarity_threshold" double precision DEFAULT 0.78,
  "match_count" integer DEFAULT 5,
  "filter" "jsonb" DEFAULT '{}'::"jsonb"
) RETURNS TABLE(
  "id" "text",
  "doc_id" "text",
  "source_url" "text",
  "title" "text",
  "chunk" "text",
  "chunk_hash" "text",
  "ingested_at" timestamp with time zone,
  "embedding" "extensions"."vector",
  "similarity" double precision
)
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM (
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
    JOIN public.rag_documents d
      ON d.doc_id = r.doc_id
    WHERE d.status = 'active'
      AND (
        similarity_threshold IS NULL
        OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold
      )
      AND (
        filter IS NULL
        OR filter = '{}'::jsonb
        OR jsonb_build_object(
          'doc_id', r.doc_id,
          'title', r.title,
          'source_url', r.source_url,
          'chunk_hash', r.chunk_hash,
          'ingested_at', r.ingested_at
        ) @> filter
      )
    ORDER BY r.embedding <=> query_embedding
    LIMIT (match_count * 3)
  ) AS ranked
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."match_native_chunks_openai_te3s_v2"(
  "query_embedding" "extensions"."vector",
  "similarity_threshold" double precision DEFAULT 0.78,
  "match_count" integer DEFAULT 5,
  "filter" "jsonb" DEFAULT '{}'::"jsonb"
) RETURNS TABLE(
  "id" "text",
  "doc_id" "text",
  "source_url" "text",
  "title" "text",
  "chunk" "text",
  "chunk_hash" "text",
  "ingested_at" timestamp with time zone,
  "embedding" "extensions"."vector",
  "similarity" double precision
)
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM (
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
    JOIN public.rag_documents d
      ON d.doc_id = r.doc_id
    WHERE d.status = 'active'
      AND (
        similarity_threshold IS NULL
        OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold
      )
      AND (
        filter IS NULL
        OR filter = '{}'::jsonb
        OR jsonb_build_object(
          'doc_id', r.doc_id,
          'title', r.title,
          'source_url', r.source_url,
          'chunk_hash', r.chunk_hash,
          'ingested_at', r.ingested_at
        ) @> filter
      )
    ORDER BY r.embedding <=> query_embedding
    LIMIT (match_count * 3)
  ) AS ranked
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"(
  "query_embedding" "extensions"."vector",
  "match_count" integer,
  "filter" "jsonb"
) TO "anon";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"(
  "query_embedding" "extensions"."vector",
  "match_count" integer,
  "filter" "jsonb"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"(
  "query_embedding" "extensions"."vector",
  "match_count" integer,
  "filter" "jsonb"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"(
  "query_embedding" "extensions"."vector",
  "match_count" integer,
  "filter" "jsonb"
) TO "anon";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"(
  "query_embedding" "extensions"."vector",
  "match_count" integer,
  "filter" "jsonb"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"(
  "query_embedding" "extensions"."vector",
  "match_count" integer,
  "filter" "jsonb"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v2"(
  "query_embedding" "extensions"."vector",
  "similarity_threshold" double precision,
  "match_count" integer,
  "filter" "jsonb"
) TO "anon";
GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v2"(
  "query_embedding" "extensions"."vector",
  "similarity_threshold" double precision,
  "match_count" integer,
  "filter" "jsonb"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v2"(
  "query_embedding" "extensions"."vector",
  "similarity_threshold" double precision,
  "match_count" integer,
  "filter" "jsonb"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v2"(
  "query_embedding" "extensions"."vector",
  "similarity_threshold" double precision,
  "match_count" integer,
  "filter" "jsonb"
) TO "anon";
GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v2"(
  "query_embedding" "extensions"."vector",
  "similarity_threshold" double precision,
  "match_count" integer,
  "filter" "jsonb"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v2"(
  "query_embedding" "extensions"."vector",
  "similarity_threshold" double precision,
  "match_count" integer,
  "filter" "jsonb"
) TO "service_role";
