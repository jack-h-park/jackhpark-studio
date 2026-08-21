import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { planMissingSweep } from "@/lib/rag/missing-sweep";

const repoRoot = process.cwd();
const RUN_STARTED = "2026-08-21T16:00:00.000Z";
const before = "2026-08-20T10:00:00.000Z";
const during = "2026-08-21T16:00:05.000Z";

/**
 * Withdrawing a card is the half that failed silently.
 *
 * Publishing worked from the first run; retiring an opted-out one never did, because the
 * interview loop ingested without stamping `last_sync_attempt_at`. Every card then looked
 * unvisited, `planMissingSweep` hit its all-unvisited safety valve, and skipped — logging one
 * line and failing nothing. The live corpus showed `last_sync_attempt_at: null` on the only
 * published card.
 *
 * These pin the mechanism rather than the log line: what the sweep does with stamped and
 * unstamped documents, and that the loop stamps.
 */
void describe("retiring a withdrawn interview card", () => {
  void it("retires a card the run did not visit, once other cards are stamped", () => {
    // Five still published, one withdrawn: 1/6 is under the 25% valve that stops a broken
    // run from wiping the lane. With only two cards a single withdrawal is 50% and would be
    // refused — correct, and worth knowing before opting a lone card out.
    const plan = planMissingSweep({
      runStartedAt: RUN_STARTED,
      activeDocs: [
        { doc_id: "card-a", last_sync_attempt_at: during },
        { doc_id: "card-b", last_sync_attempt_at: during },
        { doc_id: "card-c", last_sync_attempt_at: during },
        { doc_id: "card-d", last_sync_attempt_at: during },
        { doc_id: "card-e", last_sync_attempt_at: during },
        { doc_id: "withdrawn", last_sync_attempt_at: before },
      ],
    });
    assert.equal(plan.action, "sweep");
    if (plan.action === "sweep") {
      assert.deepEqual(
        plan.candidates.map((c) => c.doc_id),
        ["withdrawn"],
      );
    }
  });

  void it("refuses to sweep when nothing was stamped — the bug's shape", () => {
    // This is exactly what the live corpus looked like: one active document, never stamped.
    // The valve is right to skip; the defect was upstream, in never stamping.
    const plan = planMissingSweep({
      runStartedAt: RUN_STARTED,
      activeDocs: [{ doc_id: "why-pm", last_sync_attempt_at: null }],
    });
    assert.equal(plan.action, "skip");
    if (plan.action === "skip") {
      assert.equal(plan.reason, "no-visited-documents");
    }
  });

  void it("refuses a withdrawal that is too large a fraction of the lane", () => {
    // One of two cards is 50%. The valve exists so a run that half-failed cannot retire the
    // corpus; the cost is that withdrawing from a small lane needs a hand.
    const plan = planMissingSweep({
      runStartedAt: RUN_STARTED,
      activeDocs: [
        { doc_id: "kept", last_sync_attempt_at: during },
        { doc_id: "withdrawn", last_sync_attempt_at: before },
      ],
    });
    assert.equal(plan.action, "skip");
    if (plan.action === "skip") {
      assert.equal(plan.reason, "threshold-exceeded");
    }
  });

  void it("does nothing when every document was visited", () => {
    const plan = planMissingSweep({
      runStartedAt: RUN_STARTED,
      activeDocs: [{ doc_id: "why-pm", last_sync_attempt_at: during }],
    });
    assert.equal(plan.action, "skip");
    if (plan.action === "skip") {
      assert.equal(plan.reason, "nothing-to-sweep");
    }
  });
});

void describe("the interview loop stamps what the sweep reads", () => {
  void it("calls markAttempt per card before ingesting", () => {
    // Structural because the coupling is structural: the sweep reads a column the loop must
    // write, and neither the type checker nor a passing ingest notices when it does not.
    const source = readFileSync(
      path.join(repoRoot, "lib/admin/manual-ingestor.ts"),
      "utf8",
    );
    const start = source.indexOf("async function runInterviewBankIngestion");
    assert.ok(start > 0, "runInterviewBankIngestion not found");
    const loop = source.slice(start);
    const body = loop.slice(0, loop.indexOf("\nasync function ") + 1 || undefined);
    assert.match(
      body,
      /markAttempt\(supabaseClient, interviewCardDocId\(card\.slug\)\)/,
      "the interview loop must stamp last_sync_attempt_at for each card",
    );
  });
});
