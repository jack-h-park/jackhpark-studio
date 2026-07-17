-- Image caption cache for Phase 2 image-caption chunks.
--
-- Keyed by a hash of the image URL only: Notion attachment URLs embed the
-- attachment id, so replacing an image always produces a new URL while
-- text-only page edits leave it untouched. This makes the expensive VLM call
-- cache-hit on every re-ingest unless the image itself changed. The cheap
-- parts (chunk text assembly + embedding) re-run with the normal page flow.
--
-- Apply manually in the Supabase SQL editor (no automated migration runner).

CREATE TABLE IF NOT EXISTS "public"."rag_image_captions" (
    "image_url_hash" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "caption" "text" NOT NULL,
    "model" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rag_image_captions_pkey" PRIMARY KEY ("image_url_hash")
);

ALTER TABLE "public"."rag_image_captions" OWNER TO "postgres";

-- Service-role only: the cache is read/written exclusively by ingestion.
ALTER TABLE "public"."rag_image_captions" ENABLE ROW LEVEL SECURITY;
