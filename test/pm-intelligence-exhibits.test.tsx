import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";
import { Mesh, type Vector3 } from "three";

import { ObservatoryWorkbench } from "../components/pm-intelligence-world/ObservatoryWorkbench";
import {
  createDestinationExhibits,
  isWorldTargetVisible,
} from "../components/pm-intelligence-world/three/observatoryExhibits";
import { createObservatoryGarden } from "../components/pm-intelligence-world/three/observatoryGarden";
import { type PlayDestination } from "../content/pm-intelligence-world/activities";
import { exhibitDefinitions } from "../content/pm-intelligence-world/exhibits";
import {
  getExhibitState,
  nextMainUse,
} from "../lib/pm-intelligence-world/observatory-exhibits";
import {
  walkEdges,
  walkNodes,
} from "../lib/pm-intelligence-world/observatory-navigation";
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
};
void test("exhibit progress follows the selected connected source and accepted choices", () => {
  const state: ObservatoryState = {
    ...ready,
    activities: {
      "external-signals": {
        writing: { ...emptyActivity, step: 1, choices: ["observation"] },
      },
    },
  };
  assert.deepEqual(getExhibitState("writing", state).slots, [
    true,
    false,
    false,
  ]);
  assert.deepEqual(
    getExhibitState("writing", { ...state, selected: "market-study" }).slots,
    [false, false, false],
  );
  assert.equal(
    getExhibitState("writing", { ...state, connected: [] }).available,
    false,
  );
  const retried = observatoryReducer(
    { ...state, location: "writing" },
    { type: "RETRY_ACTIVITY" },
  );
  assert.deepEqual(getExhibitState("writing", retried).slots, [
    false,
    false,
    false,
  ]);
  assert.equal(
    getExhibitState("writing", observatoryReducer(state, { type: "RESET" }))
      .completed,
    false,
  );
});
void test("a judgment exhibit cannot claim a finished record before explicit finish", () => {
  const state: ObservatoryState = {
    ...ready,
    location: "decisions",
    activities: {
      "external-signals": {
        decisions: {
          ...emptyActivity,
          step: 1,
          choices: ["hold"],
          reason: "Wait for a recovery test.",
          acknowledged: true,
        },
      },
    },
  };
  assert.deepEqual(getExhibitState("decisions", state).slots, [
    true,
    true,
    true,
  ]);
  assert.equal(getExhibitState("decisions", state).completed, false);
  assert.equal(
    getExhibitState(
      "decisions",
      observatoryReducer(state, { type: "FINISH_ACTIVITY" }),
    ).completed,
    true,
  );
  assert.equal(nextMainUse(state), "writing");
  const all: ObservatoryState = {
    ...ready,
    activities: {
      "external-signals": {
        writing: { ...emptyActivity, completed: true },
        questions: { ...emptyActivity, completed: true },
        learning: { ...emptyActivity, completed: true },
      },
    },
  };
  assert.equal(nextMainUse(all), null);
});
void test("all four workbenches expose named empty slots and label the illustrative input context", () => {
  for (const destination of Object.keys(
    exhibitDefinitions,
  ) as PlayDestination[]) {
    const html = renderToStaticMarkup(
      <ObservatoryWorkbench
        destination={destination}
        source="external-signals"
        progress={emptyActivity}
      />,
    );
    assert.ok(html.includes(exhibitDefinitions[destination].title));
    assert.match(html, /Illustrative artifact/);
    assert.match(html, /External signals/);
    assert.match(html, /not generated from this input/);
    for (const label of exhibitDefinitions[destination].slots)
      assert.ok(html.includes(`${label}: empty`));
  }
});
void test("physical exhibits stay bounded and reset source-specific meshes", () => {
  const exhibit = createDestinationExhibits();
  let meshes = 0,
    triangles = 0;
  exhibit.group.traverse((o) => {
    if (o instanceof Mesh) {
      meshes++;
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      assert.ok(o.userData.location);
    }
  });
  assert.ok(meshes < 100, `${meshes} meshes`);
  assert.ok(triangles < 12_000, `${triangles} triangles`);
  assert.equal(exhibit.views.length, 4);
  exhibit.update({
    ...ready,
    activities: {
      "external-signals": {
        writing: { ...emptyActivity, step: 1, choices: ["observation"] },
      },
    },
  });
  const writing = exhibit.views.find((v) => v.destination === "writing")!;
  assert.equal(writing.slots[0].visible, true);
  assert.equal(writing.slots[1].visible, false);
  exhibit.update({ ...ready, selected: "market-study" });
  assert.equal(writing.slots[0].visible, false);
  exhibit.animate(10, false);
  assert.equal(writing.rotor.rotation.y, 0);
});

void test("hidden exhibit slots and completion seals cannot receive world clicks", () => {
  const exhibit = createDestinationExhibits();
  exhibit.update(initialObservatoryState);
  for (const view of exhibit.views) {
    assert.equal(isWorldTargetVisible(view.seal), false);
    for (const slot of view.slots)
      for (const child of slot.children)
        assert.equal(isWorldTargetVisible(child), false);
  }
  exhibit.update({
    ...ready,
    activities: {
      "external-signals": {
        writing: { ...emptyActivity, step: 1, choices: ["observation"] },
      },
    },
  });
  assert.equal(
    isWorldTargetVisible(exhibit.views[0].slots[0].children[0]),
    true,
  );
  assert.equal(
    isWorldTargetVisible(exhibit.views[0].slots[1].children[0]),
    false,
  );
});
void test("merged garden props stay clear of navigable corridor widths and retain a small rendering budget", () => {
  const garden = createObservatoryGarden();
  assert.equal(garden.children.length, 5);
  let triangles = 0;
  garden.traverse((o) => {
    if (o instanceof Mesh)
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  assert.ok(triangles < 10_000);
  const centers = garden.userData.planterCenters as Vector3[];
  for (const p of centers)
    for (const [a, b, radius] of walkEdges) {
      const start = walkNodes[a],
        end = walkNodes[b];
      const dx = end[0] - start[0],
        dz = end[2] - start[2];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - start[0]) * dx + (p.z - start[2]) * dz) / (dx * dx + dz * dz),
        ),
      );
      if (Math.abs(p.y - (start[1] + (end[1] - start[1]) * t)) > 0.65) continue;
      const distance = Math.hypot(
        p.x - start[0] - dx * t,
        p.z - start[2] - dz * t,
      );
      assert.ok(
        distance > radius + 0.41 + 0.2,
        `planter ${p.toArray()} blocks ${a} to ${b}`,
      );
    }
});
