import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

type RagSnapshot = {
  id: string;
  captured_at: string;
};

const unauthorizedResponse = NextResponse.json(
  { ok: false, error: 'Unauthorized' },
  { status: 401 }
);

export async function GET(request: Request) {
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.RAG_SNAPSHOT_CRON_SECRET;

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    return unauthorizedResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase configuration for RAG snapshot route');
    return NextResponse.json(
      { ok: false, error: 'Server misconfiguration' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabase.rpc('take_rag_snapshot');
  const snapshot = data as RagSnapshot | null;

  if (error || !snapshot) {
    console.error('Failed to take RAG snapshot', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to take snapshot' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      snapshotId: snapshot.id,
      captured_at: snapshot.captured_at
    },
    { status: 200 }
  );
}
