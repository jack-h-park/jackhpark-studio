import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";
import { Quaternion, Raycaster, Vector3 } from "three";

import { ObservatoryInstrument } from "../components/pm-intelligence-world/ObservatoryInstrument";
import {
  createDestinationExhibits,
  pickWorldTarget,
} from "../components/pm-intelligence-world/three/observatoryExhibits";
import {
  activityDefinitions,
  type PlayDestination,
} from "../content/pm-intelligence-world/activities";
import { getExhibitState } from "../lib/pm-intelligence-world/observatory-exhibits";
import {
  initialObservatoryState,
  observatoryReducer,
  type ObservatoryState,
} from "../lib/pm-intelligence-world/observatory-state";

const source = "external-signals" as const;
const ready: ObservatoryState = {
  ...initialObservatoryState,
  selected: source,
  connected: [source],
  location: "writing",
};
void test("readiness follows valid source-specific armed choices, never marks progress", () => {
  for (const destination of Object.keys(
    activityDefinitions,
  ) as PlayDestination[]) {
    let state: ObservatoryState = { ...ready, location: destination };
    const exhibits = createDestinationExhibits();
    exhibits.focus(destination);
    for (const stage of activityDefinitions[destination].stages) {
      state = observatoryReducer(state, {
        type: "ARM_ACTIVITY",
        choice: stage.options.find((option) => option.accepted)!.id,
      });
      exhibits.update(state);
      assert.deepEqual(
        exhibits.views
          .filter((view) => view.marker.visible)
          .map((view) => view.destination),
        [destination],
      );
      state = observatoryReducer(state, { type: "OPERATE_ACTIVITY" });
      exhibits.update(state);
      assert.ok(exhibits.views.every((view) => !view.marker.visible));
    }
  }
  assert.equal(getExhibitState("writing", ready).ready, false);
  const armed = observatoryReducer(ready, {
    type: "ARM_ACTIVITY",
    choice: "observation",
  });
  assert.equal(getExhibitState("writing", armed).ready, true);
  assert.equal(armed.activities[source]?.writing?.step, 0);
  assert.equal(
    getExhibitState("writing", { ...armed, connected: [] }).ready,
    false,
  );
  assert.equal(
    getExhibitState(
      "writing",
      observatoryReducer(armed, { type: "SELECT", input: "market-study" }),
    ).ready,
    false,
  );
  assert.equal(
    getExhibitState(
      "writing",
      observatoryReducer(armed, { type: "RETRY_ACTIVITY" }),
    ).ready,
    false,
  );
  assert.equal(
    getExhibitState(
      "writing",
      observatoryReducer(armed, { type: "OPERATE_ACTIVITY" }),
    ).ready,
    false,
  );
});
void test("only the active ready control has a pickable static camera-facing marker", () => {
  const e = createDestinationExhibits();
  const armed = observatoryReducer(ready, {
    type: "ARM_ACTIVITY",
    choice: "observation",
  });
  e.update(armed);
  e.focus("writing");
  assert.deepEqual(
    e.views.filter((v) => v.marker.visible).map((v) => v.destination),
    ["writing"],
  );
  const v = e.views[0];
  const orientation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    0.5,
  );
  e.animate(2, false, orientation);
  assert.ok(v.marker.quaternion.equals(orientation));
  const previous = v.marker.position.clone();
  e.animate(9, false, orientation);
  assert.ok(v.marker.position.equals(previous));
  e.group.updateMatrixWorld(true);
  const target = v.marker.getWorldPosition(new Vector3());
  const hits = new Raycaster(
    target.clone().add(new Vector3(0, 0, 5)),
    new Vector3(0, 0, -1),
  ).intersectObjects(v.marker.children);
  assert.equal(pickWorldTarget(hits)?.object.userData.operation, "writing");
  e.focus(null);
  assert.equal(pickWorldTarget(hits), undefined);
  e.focus("learning");
  assert.ok(e.views.every((x) => !x.marker.visible));
  e.focus("writing");
  e.update(observatoryReducer(armed, { type: "RETRY_ACTIVITY" }));
  assert.ok(e.views.every((x) => !x.marker.visible));
});
void test("the native panel explains readiness while preserving button and reading access", () => {
  const s = observatoryReducer(ready, {
    type: "ARM_ACTIVITY",
    choice: "observation",
  });
  const html = renderToStaticMarkup(
    <ObservatoryInstrument
      destination="writing"
      source={source}
      progress={s.activities[source]!.writing!}
      dispatch={() => {}}
      onClose={() => {}}
      onRecord={() => {}}
    />,
  );
  assert.match(html, /Ready · tap the highlighted handle/);
  assert.match(html, /Press the argument/);
  assert.match(html, /Use the reading exercise instead/);
});
