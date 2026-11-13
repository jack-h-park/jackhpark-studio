import assert from "node:assert/strict";
import test from "node:test";

import { createReadinessTiming } from "../lib/pm-intelligence-world/readiness-timing";

void test("readiness records navigation-relative boundaries once and keeps scene-relative pairing local", () => {
  let now = 100;
  const entries: { name: string; start: number; end: number }[] = [];
  const clock = {
    now: () => now,
    mark: () => undefined,
    measure: (name: string, options: { start: number; end: number }) => {
      entries.push({ name, ...options });
    },
  };
  const first = createReadinessTiming(clock);
  now = 180;
  first.record("model-loaded");
  first.record("model-loaded");
  const second = createReadinessTiming(clock);
  now = 250;
  first.record("first-frame");
  second.record("first-frame");
  assert.deepEqual(
    entries.filter((e) => e.name === "pm-world:model-loaded:scene"),
    [{ name: "pm-world:model-loaded:scene", start: 100, end: 180 }],
  );
  assert.deepEqual(
    entries
      .filter((e) => e.name === "pm-world:first-frame:scene")
      .map((e) => e.start),
    [100, 180],
  );
  assert.ok(
    entries.some(
      (e) =>
        e.name === "pm-world:first-frame:navigation" &&
        e.start === 0 &&
        e.end === 250,
    ),
  );
});

void test("disposed or unavailable diagnostics do not emit readiness success or throw", () => {
  const names: string[] = [];
  const timing = createReadinessTiming({
    now: () => 10,
    mark: () => undefined,
    measure: (name: string) => {
      names.push(name);
    },
  });
  timing.dispose();
  timing.record("interactive");
  assert.ok(!names.some((name) => name.includes("interactive")));
  const unavailable = createReadinessTiming({
    now: () => {
      throw new Error("timing denied");
    },
    mark: () => undefined,
    measure: () => undefined,
  });
  assert.doesNotThrow(() => unavailable.record("first-frame"));
  const failing = createReadinessTiming({
    now: () => 10,
    mark: () => {
      throw new Error("mark denied");
    },
    measure: () => undefined,
  });
  assert.doesNotThrow(() => failing.record("interactive"));
});
