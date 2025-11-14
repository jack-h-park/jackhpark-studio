-- Provider-specific LangChain chunk views and similarity functions
-- These views expose the SupabaseVectorStore-friendly shape
-- (id, content, metadata, embedding) for each embedding provider.

drop view if exists public.lc_chunks_openai cascade;
create or replace view public.lc_chunks_openai as
select
  concat(r.doc_id, ':', r.chunk_hash) as id,
  r.chunk as content,
  jsonb_build_object(
    'doc_id', r.doc_id,
    'title', r.title,
    'source_url', r.source_url,
    'chunk_hash', r.chunk_hash,
    'ingested_at', r.ingested_at
  ) as metadata,
  r.embedding
from public.rag_chunks_openai r;

drop view if exists public.lc_chunks_gemini cascade;
create or replace view public.lc_chunks_gemini as
select
  concat(r.doc_id, ':', r.chunk_hash) as id,
  r.chunk as content,
  jsonb_build_object(
    'doc_id', r.doc_id,
    'title', r.title,
    'source_url', r.source_url,
    'chunk_hash', r.chunk_hash,
    'ingested_at', r.ingested_at
  ) as metadata,
  r.embedding
from public.rag_chunks_gemini r;

drop view if exists public.lc_chunks_hf cascade;
create or replace view public.lc_chunks_hf as
select
  concat(r.doc_id, ':', r.chunk_hash) as id,
  r.chunk as content,
  jsonb_build_object(
    'doc_id', r.doc_id,
    'title', r.title,
    'source_url', r.source_url,
    'chunk_hash', r.chunk_hash,
    'ingested_at', r.ingested_at
  ) as metadata,
  r.embedding
from public.rag_chunks_hf r;

drop function if exists public.match_lc_chunks_openai(vector, integer, jsonb);
create or replace function public.match_lc_chunks_openai(
  query_embedding vector,
  match_count integer default 5,
  filter jsonb default '{}'::jsonb
) returns table (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.content,
    c.metadata,
    c.embedding,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.lc_chunks_openai c
  where filter is null
    or filter = '{}'::jsonb
    or c.metadata @> filter
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

drop function if exists public.match_lc_chunks_gemini(vector, integer, jsonb);
create or replace function public.match_lc_chunks_gemini(
  query_embedding vector,
  match_count integer default 5,
  filter jsonb default '{}'::jsonb
) returns table (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.content,
    c.metadata,
    c.embedding,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.lc_chunks_gemini c
  where filter is null
    or filter = '{}'::jsonb
    or c.metadata @> filter
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

drop function if exists public.match_lc_chunks_hf(vector, integer, jsonb);
create or replace function public.match_lc_chunks_hf(
  query_embedding vector,
  match_count integer default 5,
  filter jsonb default '{}'::jsonb
) returns table (
  id text,
  content text,
  metadata jsonb,
  embedding vector,
  similarity double precision
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.content,
    c.metadata,
    c.embedding,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.lc_chunks_hf c
  where filter is null
    or filter = '{}'::jsonb
    or c.metadata @> filter
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;
