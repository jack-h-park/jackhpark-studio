import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";
import {
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SphereGeometry,
  Vector3,
} from "three";

import { ObservatoryInstrument } from "../components/pm-intelligence-world/ObservatoryInstrument";
import {
  createDestinationExhibits,
  pickWorldTarget,
} from "../components/pm-intelligence-world/three/observatoryExhibits";
import {
  ownsInstrumentPointer,
  shouldOperateInstrument,
} from "../lib/pm-intelligence-world/instrument-input";
import {
  emptyActivity,
  initialObservatoryState,
  observatoryReducer,
  type ObservatoryState,
} from "../lib/pm-intelligence-world/observatory-state";

const ready: ObservatoryState = {
  ...initialObservatoryState,
  selected: "external-signals",
  connected: ["external-signals"],
  location: "writing",
};
void test("arming a card does not advance; operating applies only the armed choice", () => {
  let s = observatoryReducer(ready, {
    type: "ARM_ACTIVITY",
    choice: "observation",
  });
  assert.equal(s.activities["external-signals"]?.writing?.step, 0);
  assert.equal(
    s.activities["external-signals"]?.writing?.armedChoice,
    "observation",
  );
  s = observatoryReducer(s, { type: "OPERATE_ACTIVITY" });
  const p = s.activities["external-signals"]?.writing;
  assert.equal(p?.step, 1);
  assert.deepEqual(p?.choices, ["observation"]);
  assert.equal(p?.armedChoice, undefined);
  assert.equal(p?.operations, 1);
  assert.equal(
    observatoryReducer(s, { type: "ARM_ACTIVITY", choice: "observation" }),
    s,
  );
});
void test("wrong operations remain reversible and cannot borrow another input's armed card", () => {
  let s = observatoryReducer(ready, {
    type: "ARM_ACTIVITY",
    choice: "quality-gain",
  });
  s = observatoryReducer(s, { type: "OPERATE_ACTIVITY" });
  assert.equal(s.activities["external-signals"]?.writing?.step, 0);
  assert.match(
    s.activities["external-signals"]?.writing?.feedback ?? "",
    /not established/,
  );
  let other = observatoryReducer(s, { type: "SELECT", input: "market-study" });
  other = observatoryReducer(other, { type: "MOVE", location: "writing" });
  assert.equal(observatoryReducer(other, { type: "OPERATE_ACTIVITY" }), other);
  s = observatoryReducer(s, { type: "RETRY_ACTIVITY" });
  assert.equal(
    s.activities["external-signals"]?.writing?.armedChoice,
    undefined,
  );
  assert.equal(
    s.activities["external-signals"]?.writing?.operations,
    undefined,
  );
  assert.deepEqual(
    observatoryReducer(s, { type: "RESET" }),
    initialObservatoryState,
  );
});
void test("a direct judgment operation selects a next step but never finishes the record", () => {
  let s = observatoryReducer(
    { ...ready, location: "decisions" },
    { type: "ARM_ACTIVITY", choice: "hold" },
  );
  s = observatoryReducer(s, { type: "OPERATE_ACTIVITY" });
  assert.equal(s.activities["external-signals"]?.decisions?.completed, false);
  assert.equal(observatoryReducer(s, { type: "FINISH_ACTIVITY" }), s);
  const html = renderToStaticMarkup(
    <ObservatoryInstrument
      destination="decisions"
      source="external-signals"
      progress={s.activities["external-signals"]!.decisions!}
      dispatch={() => {}}
      onClose={() => {}}
      onRecord={() => {}}
    />,
  );
  assert.match(html, /Add a reason &amp; review trigger/);
});
void test("instrument controls offer native card selection, apply and record navigation", () => {
  const html = renderToStaticMarkup(
    <ObservatoryInstrument
      destination="writing"
      source="external-signals"
      progress={emptyActivity}
      dispatch={() => {}}
      onClose={() => {}}
      onRecord={() => {}}
    />,
  );
  assert.match(html, /Press the argument/);
  assert.match(html, /Choose a card/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /Close instrument/);
  assert.match(html, /not a real output/);
});
void test("mechanical impulses settle and reset under reduced motion", () => {
  const exhibits = createDestinationExhibits();
  exhibits.animate(1, true);
  exhibits.trigger("writing");
  exhibits.animate(1.3, true);
  assert.ok(exhibits.views[0].rotor.position.y < 0);
  exhibits.animate(2, false);
  assert.equal(exhibits.views[0].rotor.position.y, 0);
  exhibits.trigger("learning");
  exhibits.animate(2.3, true);
  assert.ok(exhibits.views[2].rotor.rotation.z > 0);
  exhibits.resetMotion();
  exhibits.animate(2.4, true);
  assert.equal(exhibits.views[2].rotor.rotation.z, 0);
});

void test("instrument hit volumes cover the whole device without drawing an opaque overlay", () => {
  const exhibits = createDestinationExhibits();
  for (const view of exhibits.views) {
    assert.equal(view.control.userData.operation, view.destination);
    assert.equal(view.control.visible, true);
    assert.equal(view.control.material.visible, false);
    view.control.geometry.computeBoundingBox();
    const box = view.control.geometry.boundingBox!;
    assert.ok(box.max.x - box.min.x >= 1.6);
    assert.ok(box.max.y - box.min.y >= 2);
  }
});

void test("dial drags operate only after an intentional horizontal turn; ordinary world drags remain orbit input", () => {
  assert.equal(shouldOperateInstrument("questions", [30, 2]), true);
  assert.equal(shouldOperateInstrument("decisions", [-40, 3]), true);
  assert.equal(shouldOperateInstrument("questions", [9, 12]), false);
  assert.equal(shouldOperateInstrument("questions", [25, 40]), false);
  assert.equal(shouldOperateInstrument("writing", [30, 2]), false);
  assert.equal(shouldOperateInstrument("learning", [1, 1]), true);
});

void test("a second pointer cannot apply or release the first pointer's armed instrument", () => {
  let s = observatoryReducer(ready, {
    type: "ARM_ACTIVITY",
    choice: "observation",
  });
  const owner = 12;
  assert.equal(ownsInstrumentPointer(owner, 22), false);
  if (ownsInstrumentPointer(owner, 22))
    s = observatoryReducer(s, { type: "OPERATE_ACTIVITY" });
  assert.equal(s.activities["external-signals"]?.writing?.step, 0);
  assert.equal(ownsInstrumentPointer(owner, 12), true);
  if (ownsInstrumentPointer(owner, 12))
    s = observatoryReducer(s, { type: "OPERATE_ACTIVITY" });
  assert.equal(s.activities["external-signals"]?.writing?.step, 1);
  assert.equal(ownsInstrumentPointer(undefined, 22), true);
});

void test("a visible source in front of an instrument wins over broad landmark hit areas", () => {
  const source = new Mesh(new SphereGeometry(0.3), new MeshBasicMaterial());
  source.userData.input = "external-signals";
  source.position.z = 2;
  const instrument = new Mesh(new SphereGeometry(0.3), new MeshBasicMaterial());
  instrument.userData.operation = "writing";
  const landmark = new Mesh(
    new SphereGeometry(0.3),
    new MeshBasicMaterial({ visible: false }),
  );
  landmark.userData.location = "knowledge";
  landmark.position.z = 4;
  for (const o of [source, instrument, landmark]) o.updateMatrixWorld(true);
  const hits = new Raycaster(
    new Vector3(0, 0, 10),
    new Vector3(0, 0, -1),
  ).intersectObjects([source, instrument, landmark]);
  assert.equal(pickWorldTarget(hits)?.object, source);
  source.visible = false;
  assert.equal(pickWorldTarget(hits)?.object, instrument);
  instrument.visible = false;
  assert.equal(pickWorldTarget(hits)?.object, landmark);
});

void test("a source capsule can be selected through its plinth area without drawing a blocking overlay", async () => {
  const { createSourceCapsule } =
    await import("../components/pm-intelligence-world/three/observatoryProps");
  for (const input of [
    "external-signals",
    "hands-on-projects",
    "market-study",
  ] as const) {
    const capsule = createSourceCapsule(input, "#65dcf4");
    capsule.group.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.5, -1.1, 3), new Vector3(0, 0, -1));
    const hit = pickWorldTarget(ray.intersectObjects(capsule.pickables));
    assert.equal(hit?.object.userData.input, input);
  }
});
