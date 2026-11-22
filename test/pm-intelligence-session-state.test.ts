import assert from "node:assert/strict";
import test from "node:test";

import { activityDefinitions } from "../content/pm-intelligence-world/activities";
import {
  observatorySessionKey,
  restoreObservatorySession,
  saveObservatorySession,
} from "../lib/pm-intelligence-world/observatory-session";
import {
  initialObservatoryState,
  type ObservatoryAction,
  observatoryReducer,
} from "../lib/pm-intelligence-world/observatory-state";

function progressed() {
  let state = initialObservatoryState;
  const send = (action: ObservatoryAction) => {
    state = observatoryReducer(state, action);
  };
  for (const input of [
    "external-signals",
    "hands-on-projects",
    "market-study",
  ] as const) {
    send({ type: "SELECT", input });
    send({ type: "INSPECT" });
    send({ type: "MOVE", location: "review" });
    send({ type: "REVIEW" });
    send({ type: "MOVE", location: "knowledge" });
    send({ type: "CONNECT" });
  }
  for (const location of [
    "writing",
    "questions",
    "learning",
    "decisions",
  ] as const) {
    send({ type: "MOVE", location });
    for (const stage of activityDefinitions[location].stages) {
      send({
        type: "ARM_ACTIVITY",
        choice: stage.options.find((o) => o.accepted)!.id,
      });
      send({ type: "OPERATE_ACTIVITY" });
    }
    if (location === "decisions") {
      send({
        type: "ACTIVITY_REASON",
        reason: "Review after a source-backed recovery test.",
      });
      send({ type: "ACTIVITY_ACK", acknowledged: true });
      send({ type: "FINISH_ACTIVITY" });
    }
  }
  return state;
}
void test("session roundtrip retains three inputs, all completed tools and the human judgment", () => {
  const state = progressed();
  const restored = restoreObservatorySession(
    JSON.stringify({ version: 1, state }),
  );
  assert.equal(restored.selected, "market-study");
  assert.equal(restored.location, "decisions");
  assert.deepEqual(restored.connected, [
    "external-signals",
    "hands-on-projects",
    "market-study",
  ]);
  for (const destination of [
    "writing",
    "questions",
    "learning",
    "decisions",
  ] as const) {
    const actual = restored.activities["market-study"]![destination]!;
    const expected = state.activities["market-study"]![destination]!;
    assert.equal(actual.completed, true);
    assert.deepEqual(actual.choices, expected.choices);
    assert.equal(actual.operations, expected.operations);
    assert.equal(actual.reason, expected.reason);
    assert.equal(actual.acknowledged, expected.acknowledged);
  }
});
void test("an armed choice survives before applying, without advancing a stage", () => {
  let state = progressed();
  state = observatoryReducer(state, { type: "MOVE", location: "writing" });
  state = observatoryReducer(state, { type: "RETRY_ACTIVITY" });
  const choice = activityDefinitions.writing.stages[0]!.options[0]!.id;
  state = observatoryReducer(state, { type: "ARM_ACTIVITY", choice });
  const actual = restoreObservatorySession(
    JSON.stringify({ version: 1, state }),
  ).activities["market-study"]!.writing!;
  assert.equal(actual.armedChoice, choice);
  assert.equal(actual.step, 0);
  assert.equal(actual.completed, false);
});
void test("invalid, incompatible and impossible receipts safely start a new expedition", () => {
  const state = progressed();
  const values: unknown[] = [
    null,
    {},
    { version: 2, state },
    { version: 1, state: { ...state, inspected: [] } },
    { version: 1, state: { ...state, location: "unknown" } },
    {
      version: 1,
      state: {
        ...state,
        activities: {
          "market-study": {
            decisions: {
              ...state.activities["market-study"]!.decisions,
              acknowledged: false,
            },
          },
        },
      },
    },
    {
      version: 1,
      state: {
        ...state,
        activities: {
          "market-study": {
            decisions: {
              ...state.activities["market-study"]!.decisions,
              reason: "",
            },
          },
        },
      },
    },
    {
      version: 1,
      state: {
        ...state,
        activities: {
          "market-study": {
            writing: {
              ...state.activities["market-study"]!.writing,
              choices: ["untrusted"],
            },
          },
        },
      },
    },
  ];
  for (const value of values)
    assert.equal(
      restoreObservatorySession(JSON.stringify(value)),
      initialObservatoryState,
    );
  assert.equal(restoreObservatorySession("{"), initialObservatoryState);
  assert.equal(
    restoreObservatorySession("x".repeat(32_001)),
    initialObservatoryState,
  );
});
void test("restart removes only this expedition key and denied storage does not throw", () => {
  const values = new Map<string, string>([["unrelated", "keep"]]);
  const storage = {
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  saveObservatorySession(storage, progressed());
  assert.equal(
    restoreObservatorySession(values.get(observatorySessionKey)!).location,
    "decisions",
  );
  saveObservatorySession(storage, initialObservatoryState);
  assert.equal(values.has(observatorySessionKey), false);
  assert.equal(values.get("unrelated"), "keep");
  assert.doesNotThrow(() =>
    saveObservatorySession(
      {
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      },
      progressed(),
    ),
  );
});
