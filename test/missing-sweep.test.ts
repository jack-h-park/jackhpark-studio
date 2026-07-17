import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createEmptyRunStats, type IngestRunErrorLog } from "@/lib/rag";
import {
  appendSweepRunLogs,
  type MissingSweepResult,
  planMissingSweep,
  sweepUnvisitedDocuments,
} from "@/lib/rag/missing-sweep";
import { markMissing } from "@/lib/rag/rag-document-lifecycle";

const RUN_STARTED_AT = "2026-07-16T10:00:00.000Z";
const BEFORE_RUN = "2026-07-01T00:00:00.000Z";
const DURING_RUN = "2026-07-16T10:00:05.000Z";

type FakeRow = {
  doc_id: string;
  source_url: string;
  status: string;
  last_sync_attempt_at: string | null;
  missing_detected_at: string | null;
  last_fetch_status: number | null;
  last_fetch_error: string | null;
};

type QueryResult = {
  data: Array<Record<string, unknown>>;
  error: null;
};

function notionRow(overrides: Partial<FakeRow> & { doc_id: string }): FakeRow {
  return {
    source_url: `https://www.notion.so/${overrides.doc_id}`,
    status: "active",
    last_sync_attempt_at: null,
    missing_detected_at: null,
    last_fetch_status: null,
    last_fetch_error: null,
    ...overrides,
  };
}

/**
 * Minimal in-memory PostgREST stand-in covering the filter chains used by
 * sweepUnvisitedDocuments and markMissing. `dropStatusUpdates` simulates the
 * observed quirk where the status="missing" PATCH silently affects 0 rows.
 */
function createFakeSupabase(
  rows: FakeRow[],
  options: { dropStatusUpdates?: number } = {},
): { client: SupabaseClient; rows: FakeRow[] } {
  const state = {
    rows,
    dropStatusUpdates: options.dropStatusUpdates ?? 0,
  };

  function makeQuery(
    kind: "select" | "update",
    payload: Partial<FakeRow> | null,
  ) {
    const filters: Array<(row: FakeRow) => boolean> = [];

    const exec = (): Promise<QueryResult> => {
      const matched = state.rows.filter((row) =>
        filters.every((filter) => filter(row)),
      );

      if (kind === "update") {
        if (
          payload &&
          payload.status === "missing" &&
          state.dropStatusUpdates > 0
        ) {
          state.dropStatusUpdates -= 1;
          return Promise.resolve({ data: [], error: null });
        }
        for (const row of matched) {
          Object.assign(row, payload);
        }
        return Promise.resolve({
          data: matched.map((row) => ({ doc_id: row.doc_id })),
          error: null,
        });
      }

      return Promise.resolve({
        data: matched.map((row) => ({ ...row })),
        error: null,
      });
    };

    const builder = {
      eq(key: keyof FakeRow, value: unknown) {
        filters.push((row) => row[key] === value);
        return builder;
      },
      neq(key: keyof FakeRow, value: unknown) {
        filters.push((row) => row[key] !== value);
        return builder;
      },
      is(key: keyof FakeRow, value: null) {
        filters.push((row) => row[key] === value);
        return builder;
      },
      like(key: keyof FakeRow, pattern: string) {
        const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
        filters.push((row) => String(row[key]).startsWith(prefix));
        return builder;
      },
      select() {
        return builder;
      },
      // The real PostgREST query builder is awaited directly, i.e. it IS a
      // thenable — the fake must mirror that to be awaitable the same way.
      // eslint-disable-next-line unicorn/no-thenable
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?:
          | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null,
      ): Promise<TResult1 | TResult2> {
        return exec().then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  const client = {
    from(table: string) {
      assert.equal(table, "rag_documents");
      return {
        select: () => makeQuery("select", null),
        update: (payload: Partial<FakeRow>) => makeQuery("update", payload),
      };
    },
  } as unknown as SupabaseClient;

  return { client, rows: state.rows };
}

void describe("planMissingSweep", () => {
  void it("selects active docs not visited by the run", () => {
    const plan = planMissingSweep({
      activeDocs: [
        { doc_id: "visited", last_sync_attempt_at: DURING_RUN },
        { doc_id: "stale", last_sync_attempt_at: BEFORE_RUN },
        { doc_id: "never-visited", last_sync_attempt_at: null },
        { doc_id: "visited-2", last_sync_attempt_at: DURING_RUN },
      ],
      runStartedAt: RUN_STARTED_AT,
      maxSweepFraction: 0.5,
    });

    assert.equal(plan.action, "sweep");
    assert.deepEqual(
      plan.action === "sweep" ? plan.candidates.map((c) => c.doc_id) : [],
      ["stale", "never-visited"],
    );
  });

  void it("refuses to sweep when the run visited nothing (failed traversal)", () => {
    const plan = planMissingSweep({
      activeDocs: [
        { doc_id: "a", last_sync_attempt_at: BEFORE_RUN },
        { doc_id: "b", last_sync_attempt_at: null },
      ],
      runStartedAt: RUN_STARTED_AT,
    });

    assert.deepEqual(plan, { action: "skip", reason: "no-visited-documents" });
  });

  void it("refuses to mass-mark beyond the sweep fraction", () => {
    const plan = planMissingSweep({
      activeDocs: [
        { doc_id: "visited", last_sync_attempt_at: DURING_RUN },
        { doc_id: "stale-1", last_sync_attempt_at: BEFORE_RUN },
        { doc_id: "stale-2", last_sync_attempt_at: BEFORE_RUN },
        { doc_id: "stale-3", last_sync_attempt_at: BEFORE_RUN },
      ],
      runStartedAt: RUN_STARTED_AT,
      maxSweepFraction: 0.25,
    });

    assert.deepEqual(plan, { action: "skip", reason: "threshold-exceeded" });
  });

  void it("skips when everything was visited or corpus is empty", () => {
    assert.deepEqual(
      planMissingSweep({
        activeDocs: [{ doc_id: "visited", last_sync_attempt_at: DURING_RUN }],
        runStartedAt: RUN_STARTED_AT,
      }),
      { action: "skip", reason: "nothing-to-sweep" },
    );
    assert.deepEqual(
      planMissingSweep({ activeDocs: [], runStartedAt: RUN_STARTED_AT }),
      { action: "skip", reason: "no-active-documents" },
    );
  });
});

void describe("sweepUnvisitedDocuments", () => {
  void it("marks unvisited Notion docs missing and leaves the rest alone", async () => {
    const { client, rows } = createFakeSupabase([
      notionRow({ doc_id: "visited", last_sync_attempt_at: DURING_RUN }),
      notionRow({ doc_id: "visited-2", last_sync_attempt_at: DURING_RUN }),
      notionRow({ doc_id: "visited-3", last_sync_attempt_at: DURING_RUN }),
      notionRow({ doc_id: "deleted", last_sync_attempt_at: BEFORE_RUN }),
      notionRow({
        doc_id: "already-missing",
        status: "missing",
        last_sync_attempt_at: BEFORE_RUN,
        missing_detected_at: BEFORE_RUN,
      }),
      {
        doc_id: "url-doc",
        source_url: "https://example.com/article",
        status: "active",
        last_sync_attempt_at: BEFORE_RUN,
        missing_detected_at: null,
        last_fetch_status: null,
        last_fetch_error: null,
      },
    ]);

    const result = await sweepUnvisitedDocuments(client, {
      runStartedAt: RUN_STARTED_AT,
    });

    assert.equal(result.skippedReason, null);
    // "already-missing" and the non-Notion doc are outside the active set.
    assert.equal(result.activeCount, 4);
    assert.equal(result.candidateCount, 1);
    assert.deepEqual(result.sweptDocIds, ["deleted"]);
    assert.deepEqual(result.failures, []);

    const swept = rows.find((row) => row.doc_id === "deleted")!;
    assert.equal(swept.status, "missing");
    assert.notEqual(swept.missing_detected_at, null);
    assert.equal(swept.last_fetch_status, 404);

    // Untouched: visited, non-Notion, and already-missing rows.
    assert.equal(rows.find((r) => r.doc_id === "visited")!.status, "active");
    assert.equal(rows.find((r) => r.doc_id === "url-doc")!.status, "active");
    assert.equal(
      rows.find((r) => r.doc_id === "already-missing")!.missing_detected_at,
      BEFORE_RUN,
    );
  });

  void it("is idempotent: a second sweep finds nothing to do", async () => {
    const { client } = createFakeSupabase([
      notionRow({ doc_id: "visited", last_sync_attempt_at: DURING_RUN }),
      notionRow({ doc_id: "visited-2", last_sync_attempt_at: DURING_RUN }),
      notionRow({ doc_id: "visited-3", last_sync_attempt_at: DURING_RUN }),
      notionRow({ doc_id: "deleted", last_sync_attempt_at: BEFORE_RUN }),
    ]);

    const first = await sweepUnvisitedDocuments(client, {
      runStartedAt: RUN_STARTED_AT,
    });
    assert.deepEqual(first.sweptDocIds, ["deleted"]);

    const second = await sweepUnvisitedDocuments(client, {
      runStartedAt: RUN_STARTED_AT,
    });
    assert.deepEqual(second.sweptDocIds, []);
    assert.equal(second.skippedReason, "nothing-to-sweep");
  });

  void it("converges in one invocation even when the first status PATCH drops", async () => {
    const { client, rows } = createFakeSupabase(
      [
        notionRow({ doc_id: "visited", last_sync_attempt_at: DURING_RUN }),
        notionRow({ doc_id: "visited-2", last_sync_attempt_at: DURING_RUN }),
        notionRow({ doc_id: "visited-3", last_sync_attempt_at: DURING_RUN }),
        notionRow({ doc_id: "deleted", last_sync_attempt_at: BEFORE_RUN }),
      ],
      // Reproduces the observed quirk: first status="missing" update affects
      // 0 rows; markMissing's verify-and-retry must still converge.
      { dropStatusUpdates: 1 },
    );

    const result = await sweepUnvisitedDocuments(client, {
      runStartedAt: RUN_STARTED_AT,
    });

    assert.deepEqual(result.sweptDocIds, ["deleted"]);
    assert.deepEqual(result.failures, []);
    const swept = rows.find((row) => row.doc_id === "deleted")!;
    assert.equal(swept.status, "missing");
    assert.notEqual(swept.missing_detected_at, null);
  });
});

void describe("markMissing", () => {
  void it("sets status and missing_detected_at in a single invocation", async () => {
    const { client, rows } = createFakeSupabase([
      notionRow({ doc_id: "doc-1", last_sync_attempt_at: BEFORE_RUN }),
    ]);

    const outcome = await markMissing(client, "doc-1", 404, "not found");
    assert.deepEqual(outcome, {
      statusUpdated: true,
      missingDetectedAtSet: true,
    });

    const row = rows[0]!;
    assert.equal(row.status, "missing");
    assert.notEqual(row.missing_detected_at, null);

    // Re-invocation stays idempotent and preserves first detection time.
    const firstDetectedAt = row.missing_detected_at;
    const again = await markMissing(client, "doc-1", 404, "not found");
    assert.deepEqual(again, {
      statusUpdated: true,
      missingDetectedAtSet: false,
    });
    assert.equal(row.missing_detected_at, firstDetectedAt);
  });

  void it("never touches soft-deleted rows", async () => {
    const { client, rows } = createFakeSupabase([
      notionRow({ doc_id: "doc-1", status: "soft_deleted" }),
    ]);

    const outcome = await markMissing(client, "doc-1", 404, "not found");
    assert.deepEqual(outcome, {
      statusUpdated: false,
      missingDetectedAtSet: false,
    });
    assert.equal(rows[0]!.status, "soft_deleted");
    assert.equal(rows[0]!.missing_detected_at, null);
  });
});

void describe("appendSweepRunLogs", () => {
  void it("records swept docs without inflating errorCount; failures do", () => {
    const stats = createEmptyRunStats();
    const errorLogs: IngestRunErrorLog[] = [];
    const result: MissingSweepResult = {
      activeCount: 10,
      candidateCount: 3,
      sweptDocIds: ["a", "b"],
      failures: [{ docId: "c", message: "markMissing did not update status" }],
      skippedReason: null,
    };

    appendSweepRunLogs(result, stats, errorLogs);

    assert.equal(stats.errorCount, 1);
    assert.deepEqual(
      errorLogs.map((entry) => [entry.context, entry.doc_id]),
      [
        ["missing-sweep", "a"],
        ["missing-sweep", "b"],
        ["missing-sweep-error", "c"],
      ],
    );
  });
});
