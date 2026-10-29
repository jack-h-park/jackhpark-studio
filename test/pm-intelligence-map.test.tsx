import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ObservatoryMap } from "../components/pm-intelligence-world/ObservatoryMap";
import {
  campusMapPaths,
  projectCampusPoint,
} from "../lib/pm-intelligence-world/observatory-map";
import { walkNodes } from "../lib/pm-intelligence-world/observatory-navigation";
import {
  emptyActivity,
  initialObservatoryState,
  observatoryLocations,
} from "../lib/pm-intelligence-world/observatory-state";

void test("map coordinates keep every actual walkway and destination inside the map", () => {
  for (const point of Object.values(walkNodes)) {
    const [x, y] = projectCampusPoint(point);
    assert.ok(x >= 22 && x <= 238);
    assert.ok(y >= 22 && y <= 198);
  }
  assert.ok(campusMapPaths.length >= 18);
  for (const path of campusMapPaths) assert.equal(path.length, 2);
  assert.ok(
    projectCampusPoint(walkNodes.writing)[0] <
      projectCampusPoint(walkNodes.questions)[0],
  );
  assert.ok(
    projectCampusPoint(walkNodes.signals)[1] >
      projectCampusPoint(walkNodes.knowledge)[1],
  );
});
void test("map offers seven native travel actions and shows the explorer independently of selected destination", () => {
  const html = renderToStaticMarkup(
    <ObservatoryMap
      state={{ ...initialObservatoryState, location: "questions" }}
      position={{ current: walkNodes.start }}
      onTravel={() => {}}
      onClose={() => {}}
    />,
  );
  for (const location of observatoryLocations)
    assert.ok(html.includes(`Travel to ${location.label}`));
  assert.equal((html.match(/type="button"/g) ?? []).length, 8);
  assert.match(html, /aria-label="Close campus map"/);
  assert.match(html, /aria-label="Explorer position"/);
  const [x, y] = projectCampusPoint(walkNodes.start);
  assert.ok(html.includes(`cx="${x}" cy="${y}"`));
  assert.match(html, /decisions optional/i);
});
void test("map completion markers follow the selected source; an unselected source cannot borrow them", () => {
  const s = {
    ...initialObservatoryState,
    selected: "external-signals" as const,
    activities: {
      "external-signals": { writing: { ...emptyActivity, completed: true } },
    },
  };
  const render = (state: typeof s | typeof initialObservatoryState) =>
    renderToStaticMarkup(
      <ObservatoryMap
        state={state}
        position={{ current: walkNodes.start }}
        onTravel={() => {}}
        onClose={() => {}}
      />,
    );
  assert.match(render(s), /Travel to Writing pavilion; activity complete/);
  assert.doesNotMatch(
    render({ ...s, selected: "market-study" }),
    /Travel to Writing pavilion; activity complete/,
  );
});
