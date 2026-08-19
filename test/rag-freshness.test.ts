import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  anyLaneStale,
  DEFAULT_STALE_AFTER_HOURS,
  FRESHNESS_LANES,
  type FreshnessLane,
  hoursBetween,
  judgeFreshness,
  resolveStaleAfterHours,
} from "@/lib/rag/freshness";

// A fixed clock passed in, never read from the environment: a test whose fixtures age by an
// hour every hour is a test that starts failing on a Tuesday for no reason.
const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

void describe("corpus freshness", () => {
  void it("treats a recent successful run as fresh", () => {
    const verdict = judgeFreshness({ lastSuccessAt: hoursAgo(5), now: NOW });
    assert.equal(verdict.stale, false);
    assert.equal(verdict.reason, "fresh");
    assert.equal(verdict.hoursSinceLastSuccess, 5);
  });

  void it("tolerates exactly one missed daily run", () => {
    // The window exists so a single hiccup does not page anyone.
    const verdict = judgeFreshness({ lastSuccessAt: hoursAgo(30), now: NOW });
    assert.equal(verdict.stale, false);
  });

  void it("calls it stale past the window", () => {
    const verdict = judgeFreshness({ lastSuccessAt: hoursAgo(40), now: NOW });
    assert.equal(verdict.stale, true);
    assert.equal(verdict.reason, "stale");
    assert.equal(verdict.hoursSinceLastSuccess, 40);
  });

  void it("is stale when nothing has ever succeeded", () => {
    // Distinct from "stale": the corpus may be fine, but nothing can vouch for it. Reporting
    // that as fresh would make the alarm useless on exactly the day it is first needed.
    const verdict = judgeFreshness({ lastSuccessAt: null, now: NOW });
    assert.equal(verdict.stale, true);
    assert.equal(verdict.reason, "never-succeeded");
    assert.equal(verdict.hoursSinceLastSuccess, null);
  });

  void it("is stale when the recorded timestamp is unparseable", () => {
    const verdict = judgeFreshness({ lastSuccessAt: "not a date", now: NOW });
    assert.equal(verdict.stale, true);
    assert.equal(verdict.reason, "never-succeeded");
  });

  void it("honours a caller-supplied window", () => {
    assert.equal(
      judgeFreshness({ lastSuccessAt: hoursAgo(10), staleAfterHours: 6, now: NOW }).stale,
      true,
    );
  });
});

void describe("stale window override", () => {
  void it("uses the default when unset", () => {
    assert.equal(resolveStaleAfterHours(undefined), DEFAULT_STALE_AFTER_HOURS);
  });

  void it("accepts a positive number", () => {
    assert.equal(resolveStaleAfterHours("12"), 12);
    assert.equal(resolveStaleAfterHours("1.5"), 1.5);
  });

  void it("falls back rather than trusting a malformed override", () => {
    // A typo must not silently disable the alarm — which is what a huge, negative or NaN
    // window would do, and it would do it quietly.
    for (const bad of ["", "  ", "soon", "0", "-1", "NaN", "Infinity"]) {
      assert.equal(
        resolveStaleAfterHours(bad),
        DEFAULT_STALE_AFTER_HOURS,
        `"${bad}" must not become the window`,
      );
    }
  });
});

void describe("hoursBetween", () => {
  void it("measures against the supplied clock", () => {
    assert.equal(hoursBetween(hoursAgo(3), NOW), 3);
    assert.equal(hoursBetween(null, NOW), null);
    assert.equal(hoursBetween("nonsense", NOW), null);
  });
});

void describe("freshness lanes", () => {
  void it("watches every lane the scheduled ingest covers", () => {
    // A lane the cron does not run would alarm for ever; a lane it runs but nobody watches
    // fails silently. Both are the bug, so the two lists must agree.
    const cronSource = readFileSync(
      path.join(process.cwd(), "app/api/internal/rag/ingest/route.ts"),
      "utf8",
    );
    assert.match(cronSource, /mode: "interview_bank"/);
    assert.match(cronSource, /scope: "workspace"/);
    assert.deepEqual(Object.keys(FRESHNESS_LANES).toSorted(), [
      "interview_bank",
      "workspace",
    ]);
  });

  void it("records a scope on bank runs so the lane can find them", () => {
    // The lane query filters `metadata->>scope`. A run without one is invisible to it.
    const ingestor = readFileSync(
      path.join(process.cwd(), "lib/admin/manual-ingestor.ts"),
      "utf8",
    );
    assert.match(ingestor, /scope: "interview_bank"/);
  });

  void it("is stale when any lane is stale", () => {
    const fresh = judgeFreshness({ lastSuccessAt: hoursAgo(2), now: NOW });
    const stale = judgeFreshness({ lastSuccessAt: hoursAgo(200), now: NOW });
    assert.equal(anyLaneStale({ workspace: fresh, interview_bank: fresh }), false);
    assert.equal(anyLaneStale({ workspace: fresh, interview_bank: stale }), true);
    assert.equal(anyLaneStale({ workspace: stale, interview_bank: fresh }), true);
    // An empty report is not evidence of health.
    assert.equal(anyLaneStale({} as Partial<Record<FreshnessLane, never>>), false);
  });
});
