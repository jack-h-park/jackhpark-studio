import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Color } from "three";

import { ObservatoryInstrument } from "../components/pm-intelligence-world/ObservatoryInstrument";
import { createExpeditionTrail } from "../components/pm-intelligence-world/three/expeditionTrail";
import {
  expeditionIntent,
  expeditionMission,
} from "../lib/pm-intelligence-world/observatory-mission";
import {
  emptyActivity,
  initialObservatoryState,
  observatoryReducer,
  type ObservatoryState,
} from "../lib/pm-intelligence-world/observatory-state";

const source = "external-signals" as const;
const ready: ObservatoryState = {
  ...initialObservatoryState,
  selected: source,
  inspected: [source],
  reviewed: [source],
  connected: [source],
};
void test("mission follows prerequisite receipts, independent of the selected destination", () => {
  let s = initialObservatoryState;
  assert.equal(expeditionMission(s).destination, "signals");
  s = observatoryReducer(s, { type: "SELECT", input: source });
  s = observatoryReducer(s, { type: "INSPECT" });
  assert.equal(expeditionMission(s).destination, "review");
  s = observatoryReducer(s, { type: "MOVE", location: "review" });
  s = observatoryReducer(s, { type: "REVIEW" });
  assert.equal(expeditionMission(s).destination, "knowledge");
  assert.equal(expeditionMission(ready).destination, "writing");
});
void test("out-of-order reuse skips completed work; decisions never gate completion", () => {
  const s: ObservatoryState = {
    ...ready,
    activities: {
      [source]: { questions: { ...emptyActivity, completed: true } },
    },
  };
  assert.equal(expeditionMission(s).destination, "writing");
  s.activities[source]!.writing = { ...emptyActivity, completed: true };
  assert.equal(expeditionMission(s).destination, "learning");
  s.activities[source]!.learning = { ...emptyActivity, completed: true };
  assert.equal(expeditionMission(s).complete, true);
  assert.equal(expeditionMission(s).completed, 6);
  assert.equal(expeditionMission(s).destination, "knowledge");
  assert.equal(
    expeditionMission({ ...s, selected: "market-study" }).completed,
    0,
  );
  assert.equal(
    expeditionMission(observatoryReducer(s, { type: "RESET" })).completed,
    0,
  );
  assert.equal(
    expeditionMission(
      observatoryReducer(
        { ...s, location: "writing" },
        { type: "RETRY_ACTIVITY" },
      ),
    ).destination,
    "writing",
  );
});
void test("route trail uses the walk graph, has bounded geometry and stops moving under reduced motion", () => {
  const trail = createExpeditionTrail();
  trail.update([-1, 0.5, 9.4], "writing");
  assert.ok(trail.points.length > 20);
  assert.ok(trail.points.some((p) => p.y > 3));
  assert.ok(trail.points.every((p) => p.y > 0.5));
  assert.ok(trail.points.length <= 160);
  trail.animate(2, false);
  const a = trail.traveler.position.clone();
  trail.animate(8, false);
  assert.ok(a.equals(trail.traveler.position));
  trail.animate(8, true);
  assert.ok(!a.equals(trail.traveler.position));
  trail.clear();
  assert.equal(trail.group.visible, false);
});

void test("station lamps reflect only the active source's receipts", () => {
  const trail = createExpeditionTrail();
  const color = new Color();
  trail.updateReceipts(ready);
  trail.lamps.getColorAt(0, color);
  assert.equal(color.getHexString(), "ffd495");
  trail.updateReceipts({ ...ready, selected: "market-study" });
  trail.lamps.getColorAt(0, color);
  assert.equal(color.getHexString(), "d7f6ff");
  trail.lamps.getColorAt(2, color);
  assert.equal(color.getHexString(), "536677");
});
void test("a completed instrument offers direct expedition continuation and retains its record", () => {
  const html = renderToStaticMarkup(
    createElement(ObservatoryInstrument, {
      destination: "writing",
      source,
      progress: { ...emptyActivity, step: 3, completed: true },
      dispatch() {},
      onClose() {},
      onRecord() {},
      onContinue() {},
      nextLabel: "Continue · PM question library",
    }),
  );
  assert.match(html, /Continue · PM question library/);
  assert.match(html, /Open the activity record/);
  assert.match(html, /Fixed teaching cards/);
});

void test("mission interaction always requires proximity, including before choosing a source", () => {
  assert.equal(expeditionIntent(initialObservatoryState, "learning"), "travel");
  assert.equal(expeditionIntent(initialObservatoryState, null), "travel");
  assert.equal(
    expeditionIntent(initialObservatoryState, "signals"),
    "choose-source",
  );
  assert.equal(expeditionIntent(ready, "knowledge"), "travel");
  assert.equal(expeditionIntent(ready, "writing"), "instrument");
  assert.equal(
    expeditionIntent({ ...ready, connected: [] }, "knowledge"),
    "context",
  );
});
