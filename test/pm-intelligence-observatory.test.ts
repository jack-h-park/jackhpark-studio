import assert from "node:assert/strict";
import test from "node:test";

import {
  initialObservatoryState,
  observatoryReducer,
} from "../lib/pm-intelligence-world/observatory-state";

void test("knowledge connection requires source inspection and human review in their locations", () => {
  let s = observatoryReducer(initialObservatoryState, {
    type: "SELECT",
    input: "external-signals",
  });
  s = observatoryReducer(s, { type: "MOVE", location: "knowledge" });
  assert.equal(observatoryReducer(s, { type: "CONNECT" }).connected.length, 0);
  s = observatoryReducer(s, { type: "MOVE", location: "signals" });
  s = observatoryReducer(s, { type: "INSPECT" });
  assert.equal(observatoryReducer(s, { type: "REVIEW" }).reviewed.length, 0);
  s = observatoryReducer(s, { type: "MOVE", location: "review" });
  s = observatoryReducer(s, { type: "REVIEW" });
  assert.equal(observatoryReducer(s, { type: "CONNECT" }).connected.length, 0);
  s = observatoryReducer(s, { type: "MOVE", location: "knowledge" });
  s = observatoryReducer(s, { type: "CONNECT" });
  assert.deepEqual(s.connected, ["external-signals"]);
  assert.deepEqual(observatoryReducer(s, { type: "CONNECT" }), s);
});

void test("switching input never borrows another input review; reset clears all play state", () => {
  let s = observatoryReducer(initialObservatoryState, {
    type: "SELECT",
    input: "external-signals",
  });
  s = observatoryReducer(s, { type: "INSPECT" });
  s = observatoryReducer(s, { type: "MOVE", location: "review" });
  s = observatoryReducer(s, { type: "REVIEW" });
  s = observatoryReducer(s, { type: "SELECT", input: "hands-on-projects" });
  s = observatoryReducer(s, { type: "MOVE", location: "knowledge" });
  assert.equal(observatoryReducer(s, { type: "CONNECT" }).connected.length, 0);
  assert.deepEqual(
    observatoryReducer(s, { type: "RESET" }),
    initialObservatoryState,
  );
});

void test("all three inputs retain independent source-review-connection receipts", () => {
  let s = initialObservatoryState;
  for (const input of [
    "external-signals",
    "hands-on-projects",
    "market-study",
  ] as const) {
    s = observatoryReducer(s, { type: "SELECT", input });
    s = observatoryReducer(s, { type: "INSPECT" });
    s = observatoryReducer(s, { type: "MOVE", location: "review" });
    s = observatoryReducer(s, { type: "REVIEW" });
    s = observatoryReducer(s, { type: "MOVE", location: "knowledge" });
    s = observatoryReducer(s, { type: "CONNECT" });
  }
  assert.equal(s.connected.length, 3);
  assert.deepEqual(s.connected, s.reviewed);
  assert.deepEqual(s.connected, s.inspected);
  const visited = observatoryReducer(s, {
    type: "MOVE",
    location: "decisions",
  });
  assert.deepEqual(visited.connected, s.connected);
});

void test("revisiting the same place or source issues a new travel request after free walking", () => {
  const a = observatoryReducer(initialObservatoryState, {
    type: "MOVE",
    location: "signals",
  });
  const b = observatoryReducer(a, { type: "MOVE", location: "signals" });
  assert.ok(b.travel > a.travel);
  const c = observatoryReducer(b, {
    type: "SELECT",
    input: "external-signals",
  });
  const d = observatoryReducer(c, {
    type: "SELECT",
    input: "external-signals",
  });
  assert.ok(d.travel > c.travel);
});
