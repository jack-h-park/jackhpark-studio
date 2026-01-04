import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { startDbQuery } from "@/lib/logging/db-logger";

type RagSnapshot = {
  id: string;
  captured_at: string;
};

const unauthorizedResponse = NextResponse.json(
  { ok: false, error: "Unauthorized" },
  { status: 401 },
);

export async function GET(request: Request) {
  // Single secret model:
  // - Vercel Cron: Authorization: Bearer <CRON_SECRET>
  // - Manual/local: x-cron-secret: <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  const headerSecret = request.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;

  const authorized = Boolean(
    secret &&
    ((bearerToken && bearerToken === secret) ||
      (headerSecret && headerSecret === secret)),
  );

  if (!authorized) {
    return unauthorizedResponse;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase configuration for RAG snapshot route", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      fromSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      fromNextPublic: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    });
    return NextResponse.json(
      { ok: false, error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const queryTracker = startDbQuery({
    action: "takeRagSnapshot",
    table: "rpc:take_rag_snapshot",
    operation: "rpc",
  });
  const { data, error } = await supabase.rpc("take_rag_snapshot");
  const snapshot = data as RagSnapshot | null;

  if (error || !snapshot) {
    queryTracker.error(error ?? new Error("RPC returned no snapshot"));
    return NextResponse.json(
      { ok: false, error: "Failed to take snapshot" },
      { status: 500 },
    );
  }

  queryTracker.done({ rowCount: snapshot ? 1 : 0 });

  return NextResponse.json(
    {
      ok: true,
      snapshotId: snapshot.id,
      captured_at: snapshot.captured_at,
    },
    { status: 200 },
  );
}
