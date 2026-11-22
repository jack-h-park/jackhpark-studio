import assert from "node:assert/strict";
import test from "node:test";

import {
  activityDefinitions,
  type PlayDestination,
} from "../content/pm-intelligence-world/activities";
import {
  initialObservatoryState,
  observatoryReducer,
  type ObservatoryState,
} from "../lib/pm-intelligence-world/observatory-state";

function connected(): ObservatoryState {
  let s = observatoryReducer(initialObservatoryState, {
    type: "SELECT",
    input: "external-signals",
  });
  s = observatoryReducer(s, { type: "INSPECT" });
  s = observatoryReducer(s, { type: "MOVE", location: "review" });
  s = observatoryReducer(s, { type: "REVIEW" });
  s = observatoryReducer(s, { type: "MOVE", location: "knowledge" });
  return observatoryReducer(s, { type: "CONNECT" });
}
void test("activities require the current connected source and matching destination", () => {
  const s = observatoryReducer(initialObservatoryState, {
    type: "MOVE",
    location: "writing",
  });
  assert.equal(
    observatoryReducer(s, { type: "PLAY", choice: "observation" }),
    s,
  );
  const ready = connected();
  assert.equal(
    observatoryReducer(ready, { type: "PLAY", choice: "observation" }),
    ready,
  );
});
void test("wrong and unknown choices never complete a writing activity", () => {
  let s = observatoryReducer(connected(), {
    type: "MOVE",
    location: "writing",
  });
  const unknown = observatoryReducer(s, { type: "PLAY", choice: "missing" });
  assert.equal(unknown, s);
  s = observatoryReducer(s, { type: "PLAY", choice: "quality-gain" });
  assert.equal(s.activities["external-signals"]?.writing?.step, 0);
  assert.match(
    s.activities["external-signals"]?.writing?.feedback ?? "",
    /not established/,
  );
});
void test("each use has an independent playable result; decisions require reason and uncertainty", () => {
  let s = connected();
  for (const destination of Object.keys(
    activityDefinitions,
  ) as PlayDestination[]) {
    s = observatoryReducer(s, { type: "MOVE", location: destination });
    for (const stage of activityDefinitions[destination].stages) {
      const choice = stage.options.find((o) => o.accepted)!.id;
      s = observatoryReducer(s, { type: "PLAY", choice });
    }
    if (destination === "decisions") {
      assert.equal(
        s.activities["external-signals"]?.decisions?.completed,
        false,
      );
      assert.equal(observatoryReducer(s, { type: "FINISH_ACTIVITY" }), s);
      s = observatoryReducer(s, {
        type: "ACTIVITY_REASON",
        reason: "Verify recovery behavior before choosing a rollout.",
      });
      assert.equal(observatoryReducer(s, { type: "FINISH_ACTIVITY" }), s);
      s = observatoryReducer(s, { type: "ACTIVITY_ACK", acknowledged: true });
      s = observatoryReducer(s, { type: "FINISH_ACTIVITY" });
    }
    assert.equal(
      s.activities["external-signals"]?.[destination]?.completed,
      true,
    );
  }
  const completed = s.activities;
  s = observatoryReducer(s, { type: "SELECT", input: "market-study" });
  s = observatoryReducer(s, { type: "MOVE", location: "writing" });
  assert.equal(
    observatoryReducer(s, { type: "PLAY", choice: "observation" }),
    s,
  );
  assert.deepEqual(s.activities, completed);
  assert.deepEqual(observatoryReducer(s, { type: "RESET" }).activities, {});
});
void test("completed receipts resist repeated inputs and retry resets only the current activity", () => {
  let s = observatoryReducer(connected(), {
    type: "MOVE",
    location: "learning",
  });
  for (const stage of activityDefinitions.learning.stages)
    s = observatoryReducer(s, {
      type: "PLAY",
      choice: stage.options.find((o) => o.accepted)!.id,
    });
  assert.equal(observatoryReducer(s, { type: "PLAY", choice: "practice" }), s);
  s = observatoryReducer(s, { type: "RETRY_ACTIVITY" });
  assert.equal(s.activities["external-signals"]?.learning?.step, 0);
  assert.equal(s.connected.length, 1);
});
