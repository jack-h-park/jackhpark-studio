import assert from "node:assert/strict";
import test from "node:test";

import { worldContent } from "@/content/pm-intelligence-world/content";
import {
  discoveryMilestones,
  illuminatedSections,
} from "@/lib/pm-intelligence-world/discovery";
import {
  experienceReducer as reduce,
  initialState,
} from "@/lib/pm-intelligence-world/state";

void test("discovery is opt-in, keeps content accessible, and requires inspected evidence", () => {
  let s = reduce(initialState, {
    type: "SELECT_INPUT",
    input: "external-signals",
  });
  assert.deepEqual(s.discovery.inputs, []);
  s = reduce(s, { type: "START_DISCOVERY" });
  assert.equal(s.mode, "explore");
  assert.equal(s.section, "inputs");
  s = reduce(s, { type: "CONNECT_RECORDS" });
  assert.equal(s.discovery.connected, false);
  for (const input of worldContent.inputs) {
    s = reduce(s, { type: "SELECT_INPUT", input: input.id });
    s = reduce(s, { type: "SELECT_INPUT", input: input.id });
  }
  assert.equal(s.discovery.inputs.length, 3);
  s = reduce(s, { type: "CONNECT_RECORDS" });
  assert.equal(s.discovery.connected, false);
  for (const record of ["strategy-note", "answer-draft"] as const)
    s = reduce(s, { type: "OPEN_RECORD", record });
  s = reduce(s, { type: "CONNECT_RECORDS" });
  assert.equal(s.discovery.connected, true);
  assert.deepEqual(discoveryMilestones(s.discovery), [
    true,
    true,
    false,
    false,
  ]);
});

void test("four reuse purposes and two role inspections precede human handback; decisions remain optional", () => {
  let s = reduce(initialState, { type: "START_DISCOVERY" });
  s = reduce(s, { type: "REVEAL_USE", use: "product-decisions" });
  s = reduce(s, { type: "ACKNOWLEDGE_REVIEW" });
  assert.equal(s.discovery.uses.length, 0);
  assert.equal(s.discovery.reviewed, false);
  for (const input of worldContent.inputs)
    s = reduce(s, { type: "SELECT_INPUT", input: input.id });
  for (const record of ["strategy-note", "answer-draft"] as const)
    s = reduce(s, { type: "OPEN_RECORD", record });
  s = reduce(s, { type: "CONNECT_RECORDS" });
  for (const use of worldContent.uses) {
    s = reduce(s, { type: "REVEAL_USE", use: use.id });
    s = reduce(s, { type: "REVEAL_USE", use: use.id });
  }
  s = reduce(s, { type: "ACKNOWLEDGE_REVIEW" });
  assert.equal(s.discovery.reviewed, false);
  for (const role of ["Cleo", "Cleo", "Orin", "Unknown"])
    s = reduce(s, { type: "INSPECT_ROLE", role });
  assert.deepEqual(s.discovery.roles, ["Cleo", "Orin"]);
  s = reduce(s, { type: "ACKNOWLEDGE_REVIEW" });
  assert.deepEqual(discoveryMilestones(s.discovery), [true, true, true, true]);
  assert.equal(s.decision.entered, false);
  assert.deepEqual(illuminatedSections(s.discovery), [
    "inputs",
    "knowledge",
    "writing",
    "questions",
    "learning",
    "decisions",
    "roles",
  ]);
  const progress = s.discovery;
  s = reduce(s, { type: "SET_MODE", mode: "quick" });
  s = reduce(s, { type: "FOCUS_SECTION", section: "limits" });
  assert.deepEqual(s.discovery.inputs, progress.inputs);
  assert.ok(s.discovery.visited.includes("limits"));
  s = reduce(s, { type: "ENTER_DECISION" });
  s = reduce(s, { type: "SET_REASON", reason: "Keep this decision separate" });
  s = reduce(s, { type: "RESET_DISCOVERY" });
  assert.equal(s.discovery.started, false);
  assert.deepEqual(s.discovery.inputs, []);
  assert.equal(s.decision.reason, "Keep this decision separate");
});

void test("opening a source outside the trail cannot earn milestones retroactively", () => {
  let s = reduce(initialState, {
    type: "OPEN_RECORD",
    record: "strategy-note",
  });
  assert.deepEqual(s.discovery.records, []);
  s = reduce(s, { type: "START_DISCOVERY" });
  s = reduce(s, { type: "FOCUS_SECTION", section: "learning" });
  s = reduce(s, { type: "START_DISCOVERY" });
  assert.ok(s.discovery.visited.includes("learning"));
  assert.equal(new Set(s.discovery.visited).size, s.discovery.visited.length);
});
