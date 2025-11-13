create table if not exists public.rag_snapshot (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default timezone('utc', now()),
  schema_version integer not null default 1,
  run_id uuid,
  run_status text,
  run_started_at timestamptz,
  run_ended_at timestamptz,
  run_duration_ms bigint,
  run_error_count integer,
  run_documents_skipped integer,
  embedding_provider text not null,
  ingestion_mode text,
  total_documents integer not null,
  total_chunks integer not null,
  total_characters bigint not null,
  delta_documents integer,
  delta_chunks integer,
  delta_characters bigint,
  error_count integer,
  skipped_documents integer,
  queue_depth integer,
  retry_count integer,
  pending_runs integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists rag_snapshot_captured_at_idx
  on public.rag_snapshot using btree (captured_at desc);
