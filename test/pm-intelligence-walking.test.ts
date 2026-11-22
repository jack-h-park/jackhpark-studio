import assert from "node:assert/strict";
import test from "node:test";

import {
  nearestDestination,
  planWalk,
  stepWalker,
  walkNodes,
} from "../lib/pm-intelligence-world/observatory-navigation";
import { observatoryLocations } from "../lib/pm-intelligence-world/observatory-state";

void test("walking normalizes diagonals, caps elapsed time and respects the cliff boundary", () => {
  const p = [-1, 0.5, 9.4] as const;
  const straight = stepWalker(p, [1, 0], 0.05, [0, -1]);
  const diagonal = stepWalker(p, [1, 1], 0.05, [0, -1]);
  const distance = (a: readonly number[]) =>
    Math.hypot(a[0] - p[0], a[2] - p[2]);
  assert.ok(Math.abs(distance(straight) - distance(diagonal)) < 0.000_01);
  assert.deepEqual(stepWalker(p, [1, 0], 30, [0, -1]), straight);
  let edge: readonly [number, number, number] = p;
  for (let i = 0; i < 200; i++) edge = stepWalker(edge, [0, -1], 0.05, [0, -1]);
  assert.ok(edge[2] < 10.7);
  assert.deepEqual(stepWalker(p, [0, 0], 0.05, [0, -1]), p);
});
void test("walking follows stair elevation and cannot walk into source plinths", () => {
  let p: readonly [number, number, number] = [-1, 0.5, 7];
  for (let i = 0; i < 20; i++) p = stepWalker(p, [0, 1], 0.05, [0, -1]);
  assert.ok(p[2] < 5);
  assert.ok(p[1] > 1.5);
  let source: readonly [number, number, number] = [-0.2, 0.5, 9];
  for (let i = 0; i < 60; i++)
    source = stepWalker(source, [0, 1], 0.05, [0, -1]);
  assert.ok(source[2] > 8.2);
});
void test("all destinations have finite routes; interrupted travel starts from the actual walkway", () => {
  for (const location of observatoryLocations) {
    const path = planWalk([-1, 0.5, 9.4], location.id);
    assert.deepEqual(path.at(-1), location.position);
    assert.ok(path.flat().every(Number.isFinite));
  }
  const path = planWalk([7, 3.4, -1.6], "decisions");
  assert.ok(!path.some((p) => p[2] > 6));
  assert.equal(nearestDestination([-1, 0.5, 9.4]), "signals");
  assert.equal(nearestDestination([-1, 2.1, 4]), null);
  assert.ok(Object.keys(walkNodes).length > 10);
});

void test("all destination route endpoints are reachable using bounded walking steps", () => {
  for (const location of observatoryLocations) {
    let p: readonly [number, number, number] = [-1, 0.5, 9.4];
    for (const target of planWalk(p, location.id)) {
      for (
        let i = 0;
        i < 300 && Math.hypot(target[0] - p[0], target[2] - p[2]) > 0.17;
        i++
      ) {
        p = stepWalker(p, [0, 1], 0.05, [target[0] - p[0], target[2] - p[2]]);
      }
      assert.ok(
        Math.hypot(target[0] - p[0], target[2] - p[2]) < 0.2,
        `${location.id}: stalled before ${target}`,
      );
    }
    assert.equal(nearestDestination(p), location.id);
  }
});

void test("pavilion walls block walking into their interiors", () => {
  let writing: readonly [number, number, number] = [-7.25, 5, -6.5];
  let questions: readonly [number, number, number] = [5.25, 5, -7];
  for (let i = 0; i < 15; i++) {
    writing = stepWalker(writing, [-1, 0], 0.05, [0, -1]);
    questions = stepWalker(questions, [1, 0], 0.05, [0, -1]);
  }
  assert.ok(writing[0] >= -7.4);
  assert.ok(questions[0] <= 5.4);
});
