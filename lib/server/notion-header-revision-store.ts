import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NotionHeaderRevisionStore } from "@/lib/server/notion-header";
import { SYSTEM_SETTINGS_TABLE } from "@/lib/chat-prompts";
import { startDbQuery } from "@/lib/logging/db-logger";
import { NotionHeaderCacheError } from "@/lib/server/notion-header-error";

function validate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
  )
    throw new NotionHeaderCacheError("invalid_revision");
  return value;
}
function rowValue(row: unknown): string {
  if (!row || typeof row !== "object" || !("value" in row))
    throw new NotionHeaderCacheError("revision_not_retained");
  return validate((row as { value: unknown }).value);
}

function storageKey(key: string): string {
  return `notion_header_revision:v1:${createHash("sha256").update(key).digest("hex")}`;
}

export function createDurableHeaderRevisionStore(
  options: {
    client?: () => SupabaseClient | Promise<SupabaseClient>;
  } = {},
): NotionHeaderRevisionStore {
  const client =
    options.client ??
    (async () => (await import("@/lib/core/supabase")).getSupabaseClient());
  async function query(
    key: string,
    write: boolean,
    action: string,
    run: (
      db: SupabaseClient,
      signal: AbortSignal,
    ) => PromiseLike<{ data: unknown; error: unknown }>,
  ) {
    const tracker = startDbQuery({
      action,
      table: SYSTEM_SETTINGS_TABLE,
      operation: write ? "upsert" : "select",
      correlationId: storageKey(key),
    });
    try {
      const result = await run(await client(), AbortSignal.timeout(5000));
      if (result.error)
        throw new Error("Database rejected the revision operation");
      tracker.done({
        rowCount: Array.isArray(result.data)
          ? result.data.length
          : result.data
            ? 1
            : 0,
      });
      return result.data;
    } catch {
      // Neither dependency errors nor revision values belong in telemetry.
      tracker.error(new Error("Header revision database operation failed"));
      throw new NotionHeaderCacheError(
        write ? "revision_write_failed" : "revision_read_failed",
      );
    }
  }
  const get = async (key: string): Promise<string | null> => {
    const row = await query(key, false, "readHeaderRevision", (db, signal) =>
      db
        .from(SYSTEM_SETTINGS_TABLE)
        .select("value")
        .eq("key", storageKey(key))
        .maybeSingle()
        .abortSignal(signal),
    );
    return row === null ? null : rowValue(row);
  };
  return {
    get,
    set: async (key, value) => {
      validate(value);
      const row = await query(key, true, "writeHeaderRevision", (db, signal) =>
        db
          .from(SYSTEM_SETTINGS_TABLE)
          .upsert(
            {
              key: storageKey(key),
              value,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
          )
          .select("value")
          .single()
          .abortSignal(signal),
      );
      if (rowValue(row) !== value)
        throw new NotionHeaderCacheError("revision_not_retained");
    },
    initialize: async (key, value) => {
      validate(value);
      // A concurrent initializer wins atomically; never replace its generation.
      const rows = await query(
        key,
        true,
        "initializeHeaderRevision",
        (db, signal) =>
          db
            .from(SYSTEM_SETTINGS_TABLE)
            .upsert(
              {
                key: storageKey(key),
                value,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "key", ignoreDuplicates: true },
            )
            .select("value")
            .abortSignal(signal),
      );
      if (!Array.isArray(rows) || rows.length > 1)
        throw new NotionHeaderCacheError("revision_not_retained");
      if (rows.length === 1) return rowValue(rows[0]);
      const retained = await get(key);
      if (retained === null)
        throw new NotionHeaderCacheError("revision_not_retained");
      return retained;
    },
    diagnostics: () => ({
      backend: "supabase-primary",
      invalidation: "durable-revision",
    }),
  };
}
