


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."match_langchain_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "content" "text", "metadata" "jsonb", "embedding" "extensions"."vector", "similarity" double precision)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."match_langchain_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_langchain_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "content" "text", "metadata" "jsonb", "embedding" "extensions"."vector", "similarity" double precision)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."match_langchain_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "content" "text", "metadata" "jsonb", "embedding" "extensions"."vector", "similarity" double precision)
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
      AND (filter IS NULL OR filter = '{}'::jsonb OR c.metadata @> filter)
    ORDER BY c.embedding <=> query_embedding
    LIMIT (match_count * 3)
  ) AS ranked
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "content" "text", "metadata" "jsonb", "embedding" "extensions"."vector", "similarity" double precision)
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
      AND (filter IS NULL OR filter = '{}'::jsonb OR c.metadata @> filter)
    ORDER BY c.embedding <=> query_embedding
    LIMIT (match_count * 3)
  ) AS ranked
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_native_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision DEFAULT 0.78, "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "doc_id" "text", "source_url" "text", "title" "text", "chunk" "text", "chunk_hash" "text", "ingested_at" timestamp with time zone, "embedding" "extensions"."vector", "similarity" double precision)
    LANGUAGE "plpgsql"
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
  WHERE (similarity_threshold IS NULL OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold)
    AND (filter IS NULL OR filter = '{}'::jsonb OR jsonb_build_object(
      'doc_id', r.doc_id,
      'title', r.title,
      'source_url', r.source_url,
      'chunk_hash', r.chunk_hash,
      'ingested_at', r.ingested_at
    ) @> filter)
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_native_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_native_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision DEFAULT 0.78, "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "doc_id" "text", "source_url" "text", "title" "text", "chunk" "text", "chunk_hash" "text", "ingested_at" timestamp with time zone, "embedding" "extensions"."vector", "similarity" double precision)
    LANGUAGE "plpgsql"
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
  WHERE (similarity_threshold IS NULL OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold)
    AND (filter IS NULL OR filter = '{}'::jsonb OR jsonb_build_object(
      'doc_id', r.doc_id,
      'title', r.title,
      'source_url', r.source_url,
      'chunk_hash', r.chunk_hash,
      'ingested_at', r.ingested_at
    ) @> filter)
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_native_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."match_native_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision DEFAULT 0.78, "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "doc_id" "text", "source_url" "text", "title" "text", "chunk" "text", "chunk_hash" "text", "ingested_at" timestamp with time zone, "embedding" "extensions"."vector", "similarity" double precision)
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
      AND (similarity_threshold IS NULL OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold)
      AND (filter IS NULL OR filter = '{}'::jsonb OR jsonb_build_object(
        'doc_id', r.doc_id,
        'title', r.title,
        'source_url', r.source_url,
        'chunk_hash', r.chunk_hash,
        'ingested_at', r.ingested_at
      ) @> filter)
    ORDER BY r.embedding <=> query_embedding
    LIMIT (match_count * 3)
  ) AS ranked
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_native_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."match_native_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision DEFAULT 0.78, "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "doc_id" "text", "source_url" "text", "title" "text", "chunk" "text", "chunk_hash" "text", "ingested_at" timestamp with time zone, "embedding" "extensions"."vector", "similarity" double precision)
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
      AND (similarity_threshold IS NULL OR 1 - (r.embedding <=> query_embedding) >= similarity_threshold)
      AND (filter IS NULL OR filter = '{}'::jsonb OR jsonb_build_object(
        'doc_id', r.doc_id,
        'title', r.title,
        'source_url', r.source_url,
        'chunk_hash', r.chunk_hash,
        'ingested_at', r.ingested_at
      ) @> filter)
    ORDER BY r.embedding <=> query_embedding
    LIMIT (match_count * 3)
  ) AS ranked
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_native_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_rag_chunks_langchain_gemini"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "content" "text", "metadata" "jsonb", "embedding" "extensions"."vector", "similarity" double precision)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."match_rag_chunks_langchain_gemini"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_rag_chunks_langchain_openai"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 5, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "content" "text", "metadata" "jsonb", "embedding" "extensions"."vector", "similarity" double precision)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."match_rag_chunks_langchain_openai"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_rag_chunks_native_gemini"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 5, "similarity_threshold" double precision DEFAULT 0.78, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "doc_id" "text", "source_url" "text", "title" "text", "chunk" "text", "chunk_hash" "text", "ingested_at" timestamp with time zone, "embedding" "extensions"."vector", "similarity" double precision)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."match_rag_chunks_native_gemini"("query_embedding" "extensions"."vector", "match_count" integer, "similarity_threshold" double precision, "filter" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_rag_chunks_native_openai"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 5, "similarity_threshold" double precision DEFAULT 0.78, "filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("id" "text", "doc_id" "text", "source_url" "text", "title" "text", "chunk" "text", "chunk_hash" "text", "ingested_at" timestamp with time zone, "embedding" "extensions"."vector", "similarity" double precision)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."match_rag_chunks_native_openai"("query_embedding" "extensions"."vector", "match_count" integer, "similarity_threshold" double precision, "filter" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."rag_snapshot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "schema_version" integer DEFAULT 1 NOT NULL,
    "run_id" "uuid",
    "run_status" "text",
    "run_started_at" timestamp with time zone,
    "run_ended_at" timestamp with time zone,
    "run_duration_ms" bigint,
    "run_error_count" integer,
    "run_documents_skipped" integer,
    "embedding_provider" "text" NOT NULL,
    "ingestion_mode" "text",
    "total_documents" integer NOT NULL,
    "total_chunks" integer NOT NULL,
    "total_characters" bigint NOT NULL,
    "delta_documents" integer,
    "delta_chunks" integer,
    "delta_characters" bigint,
    "error_count" integer,
    "skipped_documents" integer,
    "queue_depth" integer,
    "retry_count" integer,
    "pending_runs" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."rag_snapshot" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."take_rag_snapshot"() RETURNS "public"."rag_snapshot"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_agg record;
  v_prev public.rag_snapshot;
  v_run  public.rag_ingest_runs;
  v_row  public.rag_snapshot;
begin
  -- 1) 현재 코퍼스 전체 규모 집계 (rag_documents 기준)
  select
    count(*)::int                         as total_documents,
    coalesce(sum(chunk_count), 0)::int    as total_chunks,
    coalesce(sum(total_characters), 0)::bigint as total_characters
  into v_agg
  from public.rag_documents;

  -- 2) 직전 스냅샷 (delta 계산용)
  select *
  into v_prev
  from public.rag_snapshot
  order by captured_at desc
  limit 1;

  -- 3) 마지막 ingestion run (요약 노출용)
  select *
  into v_run
  from public.rag_ingest_runs
  order by started_at desc
  limit 1;

  -- 4) 스냅샷 insert
  insert into public.rag_snapshot (
    captured_at,
    schema_version,
    run_id,
    run_status,
    run_started_at,
    run_ended_at,
    run_duration_ms,
    run_error_count,
    run_documents_skipped,
    embedding_provider,
    ingestion_mode,
    total_documents,
    total_chunks,
    total_characters,
    delta_documents,
    delta_chunks,
    delta_characters,
    error_count,
    skipped_documents,
    queue_depth,
    retry_count,
    pending_runs,
    metadata
  )
  values (
    timezone('utc', now())::timestamptz,
    1, -- schema_version
    v_run.id,
    v_run.status,
    v_run.started_at,
    v_run.ended_at,
    case
      when v_run.id is not null then
        coalesce(v_run.duration_ms, (
          extract(epoch from (coalesce(v_run.ended_at, now()) - v_run.started_at)) * 1000
        )::bigint)
      else null
    end,
    case when v_run.id is not null then v_run.error_count else null end,
    case when v_run.id is not null then v_run.documents_skipped else null end,
    'multi',                -- embedding_provider (멀티 모델 환경)
    case
      when v_run.id is not null then v_run.ingestion_type
      else null
    end,                    -- ingestion_mode
    v_agg.total_documents,
    v_agg.total_chunks,
    v_agg.total_characters,
    v_agg.total_documents - coalesce(v_prev.total_documents, 0),
    v_agg.total_chunks     - coalesce(v_prev.total_chunks, 0),
    v_agg.total_characters - coalesce(v_prev.total_characters, 0),
    -- error_count / skipped_documents는 우선 run 기반으로 맞춰둠
    case when v_run.id is not null then v_run.error_count else null end,
    case when v_run.id is not null then v_run.documents_skipped else null end,
    null, -- queue_depth (아직 미사용)
    null, -- retry_count (아직 미사용)
    null, -- pending_runs (아직 미사용)
    '{}'::jsonb
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."take_rag_snapshot"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rag_chunks_gemini_te4_v1" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_id" "text" NOT NULL,
    "source_url" "text",
    "title" "text",
    "chunk" "text" NOT NULL,
    "chunk_hash" "text" NOT NULL,
    "embedding" "extensions"."vector"(768) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ingested_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rag_chunks_gemini_te4_v1" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lc_chunks_gemini_te4_v1" WITH ("security_invoker"='on') AS
 SELECT "concat"("doc_id", ':', "chunk_hash") AS "id",
    "chunk" AS "content",
    "jsonb_build_object"('doc_id', "doc_id", 'title', "title", 'source_url', "source_url", 'chunk_hash', "chunk_hash", 'ingested_at', "ingested_at") AS "metadata",
    "embedding"
   FROM "public"."rag_chunks_gemini_te4_v1" "r";


ALTER VIEW "public"."lc_chunks_gemini_te4_v1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rag_chunks_openai_te3s_v1" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_id" "text" NOT NULL,
    "source_url" "text",
    "title" "text",
    "chunk" "text" NOT NULL,
    "chunk_hash" "text" NOT NULL,
    "embedding" "extensions"."vector"(1536) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ingested_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rag_chunks_openai_te3s_v1" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lc_chunks_openai_te3s_v1" WITH ("security_invoker"='on') AS
 SELECT "concat"("doc_id", ':', "chunk_hash") AS "id",
    "chunk" AS "content",
    "jsonb_build_object"('doc_id', "doc_id", 'title', "title", 'source_url', "source_url", 'chunk_hash', "chunk_hash", 'ingested_at', "ingested_at") AS "metadata",
    "embedding"
   FROM "public"."rag_chunks_openai_te3s_v1" "r";


ALTER VIEW "public"."lc_chunks_openai_te3s_v1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rag_documents" (
    "doc_id" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "last_ingested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_source_update" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "chunk_count" integer DEFAULT 0,
    "total_characters" bigint DEFAULT 0,
    "raw_doc_id" "text"
);


ALTER TABLE "public"."rag_documents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rag_documents"."raw_doc_id" IS 'Original external ID as ingested (e.g. Notion pageId); doc_id will become canonical/normalized later.';



CREATE TABLE IF NOT EXISTS "public"."rag_ingest_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "ingestion_type" "text" NOT NULL,
    "partial_reason" "text",
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "duration_ms" integer,
    "documents_processed" integer DEFAULT 0 NOT NULL,
    "documents_added" integer DEFAULT 0 NOT NULL,
    "documents_updated" integer DEFAULT 0 NOT NULL,
    "documents_skipped" integer DEFAULT 0 NOT NULL,
    "chunks_added" integer DEFAULT 0 NOT NULL,
    "chunks_updated" integer DEFAULT 0 NOT NULL,
    "characters_added" bigint DEFAULT 0 NOT NULL,
    "characters_updated" bigint DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "error_logs" "jsonb",
    "metadata" "jsonb",
    "source_url" "text",
    CONSTRAINT "rag_ingest_runs_ingestion_type_check" CHECK (("ingestion_type" = ANY (ARRAY['full'::"text", 'partial'::"text"]))),
    CONSTRAINT "rag_ingest_runs_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'success'::"text", 'completed_with_errors'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."rag_ingest_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "chat_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."rag_chunks_gemini_te4_v1"
    ADD CONSTRAINT "rag_chunks_gemini_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rag_chunks_openai_te3s_v1"
    ADD CONSTRAINT "rag_chunks_openai_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rag_documents"
    ADD CONSTRAINT "rag_documents_pkey" PRIMARY KEY ("doc_id");



ALTER TABLE ONLY "public"."rag_ingest_runs"
    ADD CONSTRAINT "rag_ingest_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rag_snapshot"
    ADD CONSTRAINT "rag_snapshot_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "rag_chunks_gemini_doc_id_chunk_hash_idx" ON "public"."rag_chunks_gemini_te4_v1" USING "btree" ("doc_id", "chunk_hash");



CREATE INDEX "rag_chunks_gemini_embedding_idx" ON "public"."rag_chunks_gemini_te4_v1" USING "ivfflat" ("embedding") WITH ("lists"='16');



CREATE UNIQUE INDEX "rag_chunks_openai_doc_id_chunk_hash_idx" ON "public"."rag_chunks_openai_te3s_v1" USING "btree" ("doc_id", "chunk_hash");



CREATE INDEX "rag_chunks_openai_embedding_idx" ON "public"."rag_chunks_openai_te3s_v1" USING "ivfflat" ("embedding") WITH ("lists"='16');



CREATE INDEX "rag_documents_last_ingested_at_idx" ON "public"."rag_documents" USING "btree" ("last_ingested_at" DESC);



CREATE INDEX "rag_documents_source_url_idx" ON "public"."rag_documents" USING "btree" ("source_url");



CREATE INDEX "rag_ingest_runs_started_at_idx" ON "public"."rag_ingest_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "rag_snapshot_captured_at_idx" ON "public"."rag_snapshot" USING "btree" ("captured_at" DESC);



CREATE INDEX "rag_snapshot_run_id_idx" ON "public"."rag_snapshot" USING "btree" ("run_id");



ALTER TABLE ONLY "public"."rag_snapshot"
    ADD CONSTRAINT "rag_snapshot_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."rag_ingest_runs"("id") ON DELETE SET NULL;



ALTER TABLE "public"."rag_chunks_gemini_te4_v1" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rag_chunks_openai_te3s_v1" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rag_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rag_ingest_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rag_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_langchain_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v1"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_native_chunks_gemini_te4_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_native_chunks_openai_te3s_v2"("query_embedding" "extensions"."vector", "similarity_threshold" double precision, "match_count" integer, "filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_rag_chunks_langchain_gemini"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_rag_chunks_langchain_gemini"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_rag_chunks_langchain_gemini"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_rag_chunks_langchain_openai"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_rag_chunks_langchain_openai"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_rag_chunks_langchain_openai"("query_embedding" "extensions"."vector", "match_count" integer, "filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_rag_chunks_native_gemini"("query_embedding" "extensions"."vector", "match_count" integer, "similarity_threshold" double precision, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_rag_chunks_native_gemini"("query_embedding" "extensions"."vector", "match_count" integer, "similarity_threshold" double precision, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_rag_chunks_native_gemini"("query_embedding" "extensions"."vector", "match_count" integer, "similarity_threshold" double precision, "filter" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_rag_chunks_native_openai"("query_embedding" "extensions"."vector", "match_count" integer, "similarity_threshold" double precision, "filter" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."match_rag_chunks_native_openai"("query_embedding" "extensions"."vector", "match_count" integer, "similarity_threshold" double precision, "filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_rag_chunks_native_openai"("query_embedding" "extensions"."vector", "match_count" integer, "similarity_threshold" double precision, "filter" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."rag_snapshot" TO "anon";
GRANT ALL ON TABLE "public"."rag_snapshot" TO "authenticated";
GRANT ALL ON TABLE "public"."rag_snapshot" TO "service_role";



GRANT ALL ON FUNCTION "public"."take_rag_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."take_rag_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."take_rag_snapshot"() TO "service_role";



GRANT ALL ON TABLE "public"."rag_chunks_gemini_te4_v1" TO "anon";
GRANT ALL ON TABLE "public"."rag_chunks_gemini_te4_v1" TO "authenticated";
GRANT ALL ON TABLE "public"."rag_chunks_gemini_te4_v1" TO "service_role";



GRANT ALL ON TABLE "public"."lc_chunks_gemini_te4_v1" TO "anon";
GRANT ALL ON TABLE "public"."lc_chunks_gemini_te4_v1" TO "authenticated";
GRANT ALL ON TABLE "public"."lc_chunks_gemini_te4_v1" TO "service_role";



GRANT ALL ON TABLE "public"."rag_chunks_openai_te3s_v1" TO "anon";
GRANT ALL ON TABLE "public"."rag_chunks_openai_te3s_v1" TO "authenticated";
GRANT ALL ON TABLE "public"."rag_chunks_openai_te3s_v1" TO "service_role";



GRANT ALL ON TABLE "public"."lc_chunks_openai_te3s_v1" TO "anon";
GRANT ALL ON TABLE "public"."lc_chunks_openai_te3s_v1" TO "authenticated";
GRANT ALL ON TABLE "public"."lc_chunks_openai_te3s_v1" TO "service_role";



GRANT ALL ON TABLE "public"."rag_documents" TO "anon";
GRANT ALL ON TABLE "public"."rag_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."rag_documents" TO "service_role";



GRANT ALL ON TABLE "public"."rag_ingest_runs" TO "anon";
GRANT ALL ON TABLE "public"."rag_ingest_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."rag_ingest_runs" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";




