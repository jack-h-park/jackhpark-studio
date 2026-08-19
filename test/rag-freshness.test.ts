import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_STALE_AFTER_HOURS,
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
