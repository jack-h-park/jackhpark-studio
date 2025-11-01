import type { NextApiRequest, NextApiResponse } from "next";

import {
  DEFAULT_RUNS_PAGE_SIZE,
  INGESTION_TYPE_VALUES,
  type IngestionType,
  MAX_RUNS_PAGE_SIZE,
  normalizeRunRecord,
  RUN_STATUS_VALUES,
  type RunRecord,
  type RunStatus,
} from "../../../lib/admin/ingestion-runs";
import { getSupabaseAdminClient } from "../../../lib/supabase-admin";

type RunsResponse = {
  runs: RunRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  statusOptions: RunStatus[];
  ingestionTypeOptions: IngestionType[];
};

type ParsedQuery = {
  page: number;
  pageSize: number;
  statuses: RunStatus[];
  sources: string[];
  ingestionTypes: IngestionType[];
  startedFrom: string | null;
  startedTo: string | null;
};

function toList(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((item) =>
      item
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .filter((entry, index, self) => self.indexOf(entry) === index);
}

function toString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function normalizeDateParam(
  value: string | undefined,
  mode: "start" | "end",
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix =
      mode === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    const parsed = new Date(`${trimmed}${suffix}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseQuery(query: NextApiRequest["query"]): ParsedQuery {
  const pageValue = toString(query.page);
  const page =
    pageValue !== undefined
      ? Math.max(1, Number.parseInt(pageValue, 10) || 1)
      : 1;

  const pageSizeValue = toString(query.pageSize);
  const pageSizeRaw =
    pageSizeValue !== undefined
      ? Number.parseInt(pageSizeValue, 10) || DEFAULT_RUNS_PAGE_SIZE
      : DEFAULT_RUNS_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, pageSizeRaw), MAX_RUNS_PAGE_SIZE);

  const statusSet = new Set<RunStatus>();
  for (const candidate of toList(query.status)) {
    if (RUN_STATUS_VALUES.includes(candidate as RunStatus)) {
      statusSet.add(candidate as RunStatus);
    }
  }

  const statuses = Array.from(statusSet);

  const sourceSet = new Set<string>();
  for (const candidate of toList(query.source)) {
    sourceSet.add(candidate);
  }
  const sources = Array.from(sourceSet);

  const ingestionTypeSet = new Set<IngestionType>();
  for (const candidate of toList(query.ingestionType)) {
    if (INGESTION_TYPE_VALUES.includes(candidate as IngestionType)) {
      ingestionTypeSet.add(candidate as IngestionType);
    }
  }
  const ingestionTypes = Array.from(ingestionTypeSet);

  const startedFrom = normalizeDateParam(
    toString(query.startedFrom),
    "start",
  );
  const startedTo = normalizeDateParam(toString(query.startedTo), "end");

  return {
    page,
    pageSize,
    statuses,
    sources,
    ingestionTypes,
    startedFrom,
    startedTo,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RunsResponse | { error: string }>,
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { page, pageSize, statuses, sources, ingestionTypes, startedFrom, startedTo } =
    parseQuery(req.query);

  const offset = (page - 1) * pageSize;
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from("rag_ingest_runs")
    .select(
      "id, source, ingestion_type, partial_reason, status, started_at, ended_at, duration_ms, documents_processed, documents_added, documents_updated, documents_skipped, chunks_added, chunks_updated, characters_added, characters_updated, error_count, error_logs, metadata",
      { count: "exact" },
    )
    .order("started_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (statuses.length > 0) {
    query = query.in("status", statuses);
  }

  if (sources.length > 0) {
    query = query.in("source", sources);
  }

  if (ingestionTypes.length > 0) {
    query = query.in("ingestion_type", ingestionTypes);
  }

  if (startedFrom) {
    query = query.gte("started_at", startedFrom);
  }

  if (startedTo) {
    query = query.lte("started_at", startedTo);
  }

  const { data, error, count } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const runs = Array.isArray(data)
    ? data.map((run) => normalizeRunRecord(run))
    : [];

  const totalCount = count ?? 0;
  const totalPages =
    pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  res.status(200).json({
    runs,
    page,
    pageSize,
    totalCount,
    totalPages,
    statusOptions: [...RUN_STATUS_VALUES],
    ingestionTypeOptions: [...INGESTION_TYPE_VALUES],
  });
}
