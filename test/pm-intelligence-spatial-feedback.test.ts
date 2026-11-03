import assert from "node:assert/strict";
import test from "node:test";

import { Mesh, Points, Vector3 } from "three";

import { createSpatialFeedback } from "../components/pm-intelligence-world/three/spatialFeedback";
import { activityDefinitions } from "../content/pm-intelligence-world/activities";
import {
  initialObservatoryState,
  observatoryReducer,
  type ObservatoryState,
} from "../lib/pm-intelligence-world/observatory-state";
import {
  clearsSpatialFeedback,
  feedbackTransition,
} from "../lib/pm-intelligence-world/spatial-feedback";

const source = "external-signals" as const;
const ready: ObservatoryState = {
  ...initialObservatoryState,
  selected: source,
  inspected: [source],
  reviewed: [source],
  connected: [source],
  location: "writing",
};
void test("only applied reducer operations emit spatial outcomes", () => {
  const armed = observatoryReducer(ready, {
    type: "ARM_ACTIVITY",
    choice: "quality-gain",
  });
  assert.equal(feedbackTransition(ready, armed), null);
  const wrong = observatoryReducer(armed, { type: "OPERATE_ACTIVITY" });
  assert.equal(feedbackTransition(armed, wrong)?.kind, "revise");
  const again = observatoryReducer(wrong, { type: "OPERATE_ACTIVITY" });
  assert.equal(feedbackTransition(wrong, again)?.kind, "revise");
  const nativeAgain = observatoryReducer(again, {
    type: "PLAY",
    choice: "quality-gain",
  });
  assert.equal(feedbackTransition(again, nativeAgain)?.kind, "revise");
  const good = observatoryReducer(nativeAgain, {
    type: "PLAY",
    choice: "observation",
  });
  assert.equal(feedbackTransition(nativeAgain, good)?.kind, "accepted");
  assert.equal(
    feedbackTransition(
      good,
      observatoryReducer(good, { type: "MOVE", location: "questions" }),
    ),
    null,
  );
  assert.equal(
    feedbackTransition(
      good,
      observatoryReducer(good, { type: "SELECT", input: "market-study" }),
    ),
    null,
  );
  assert.ok(
    clearsSpatialFeedback(
      good,
      observatoryReducer(good, { type: "RETRY_ACTIVITY" }),
    ),
  );
  assert.ok(clearsSpatialFeedback(good, initialObservatoryState));
});
void test("prerequisite receipts survive batched navigation; duplicates are silent", () => {
  const before = { ...initialObservatoryState, selected: source };
  const inspected = observatoryReducer(before, { type: "INSPECT" });
  assert.equal(feedbackTransition(before, inspected)?.location, "signals");
  const reviewing = { ...inspected, location: "review" as const };
  const reviewed = observatoryReducer(reviewing, { type: "REVIEW" });
  assert.equal(
    feedbackTransition(
      reviewing,
      observatoryReducer(reviewed, { type: "MOVE", location: "knowledge" }),
    )?.location,
    "review",
  );
  const atKnowledge = { ...reviewed, location: "knowledge" as const };
  const connected = observatoryReducer(atKnowledge, { type: "CONNECT" });
  assert.equal(feedbackTransition(atKnowledge, connected)?.kind, "connected");
  assert.equal(
    feedbackTransition(
      connected,
      observatoryReducer(connected, { type: "CONNECT" }),
    ),
    null,
  );
});
void test("completion comes from valid choices; judgment still requires explicit finish", () => {
  let s = ready;
  for (const stage of activityDefinitions.writing.stages) {
    const next = observatoryReducer(s, {
      type: "PLAY",
      choice: stage.options.find((o) => o.accepted)!.id,
    });
    assert.equal(
      feedbackTransition(s, next)?.kind,
      next.activities[source]!.writing!.completed ? "completed" : "accepted",
    );
    s = next;
  }
  assert.equal(feedbackTransition(s, s), null);
  let d = { ...ready, location: "decisions" as const };
  d = observatoryReducer(d, { type: "PLAY", choice: "hold" }) as typeof d;
  assert.equal(d.activities[source]?.decisions?.completed, false);
  const reason = observatoryReducer(d, {
    type: "ACTIVITY_REASON",
    reason: "Collect evidence before another review.",
  });
  assert.equal(feedbackTransition(d, reason), null);
  assert.equal(
    feedbackTransition(
      reason,
      observatoryReducer(reason, {
        type: "ACTIVITY_REASON",
        reason: reason.activities[source]!.decisions!.reason,
      }),
    ),
    null,
  );
  const acknowledged = observatoryReducer(reason, {
    type: "ACTIVITY_ACK",
    acknowledged: true,
  });
  assert.equal(feedbackTransition(reason, acknowledged), null);
  assert.equal(
    feedbackTransition(
      acknowledged,
      observatoryReducer(acknowledged, { type: "FINISH_ACTIVITY" }),
    )?.kind,
    "completed",
  );
});
void test("effects are bounded, follow the graph, expire, and reduced motion never replays them", () => {
  const fx = createSpatialFeedback();
  fx.emit({ kind: "accepted", location: "writing", source });
  assert.equal(fx.courier.visible, false);
  fx.emit({ kind: "completed", location: "writing", source });
  assert.ok(fx.path.some((p) => p.x === -4.2));
  const first = fx.courier.position.clone();
  fx.animate(0.5, true);
  assert.ok(fx.courier.position.distanceTo(first) > 0.1);
  const tail = fx.group.children.find(
    (child) => child instanceof Points,
  ) as Points;
  assert.ok(
    tail.geometry.attributes.position.getX(0) !== first.x ||
      tail.geometry.attributes.position.getZ(0) !== first.z,
  );
  fx.arrive("questions");
  fx.animate(0.2, true);
  assert.ok(fx.courier.visible);
  fx.animate(10, true);
  assert.equal(fx.group.visible, false);
  fx.emit({ kind: "completed", location: "learning", source });
  fx.animate(0.1, false);
  assert.equal(fx.group.visible, false);
  fx.animate(0.1, true);
  assert.equal(fx.group.visible, false);
  fx.arrive("review");
  fx.reset();
  assert.equal(fx.group.visible, false);
  let meshes = 0,
    triangles = 0;
  fx.group.traverse((o) => {
    if (o instanceof Mesh || o instanceof Points) {
      meshes++;
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    }
  });
  assert.ok(meshes <= 6);
  assert.ok(triangles < 900);
  assert.ok(fx.courier.position instanceof Vector3);
});
