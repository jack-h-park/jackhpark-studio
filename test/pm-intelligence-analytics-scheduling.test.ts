import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import { scheduleExperienceAnalytics } from "../lib/analytics/experience-loader";

function environment(hash = "#observatory") {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: `http://localhost/experiences/pm-intelligence${hash}`,
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.assign(globalThis, { window: dom.window });
  let id = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const idle = new Map<number, () => void>();
  let disconnected = 0;
  const observations: { type: string; buffered: boolean }[] = [];
  const listeners: ((entries: { getEntries(): { name: string }[] }) => void)[] =
    [];
  Object.defineProperties(dom.window, {
    setTimeout: {
      value: (callback: () => void, delay: number) => {
        timers.set(++id, { callback, delay });
        return id;
      },
    },
    clearTimeout: { value: (key: number) => timers.delete(key) },
    requestIdleCallback: {
      value: (callback: () => void) => {
        idle.set(++id, callback);
        return id;
      },
      configurable: true,
    },
    cancelIdleCallback: { value: (key: number) => idle.delete(key) },
    PerformanceObserver: {
      value: class {
        constructor(
          callback: (entries: { getEntries(): { name: string }[] }) => void,
        ) {
          listeners.push(callback);
        }
        observe(options: { type: string; buffered: boolean }) {
          observations.push(options);
        }
        disconnect() {
          disconnected++;
        }
      },
      configurable: true,
    },
  });
  let marks: { name: string }[] = [];
  Object.defineProperty(dom.window.performance, "getEntriesByName", {
    value: (name: string) => marks.filter((entry) => entry.name === name),
    configurable: true,
  });
  return {
    dom,
    timers,
    idle,
    observations,
    get disconnected() {
      return disconnected;
    },
    rememberReady: () => {
      marks = [{ name: "pm-world:interactive" }];
    },
    emit: (name = "pm-world:interactive") => {
      for (const listener of listeners)
        listener({ getEntries: () => [{ name }] });
    },
    flushIdle: () => {
      const callbacks = [...idle.values()];
      idle.clear();
      for (const callback of callbacks) callback();
    },
    close: () => {
      dom.window.close();
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

void test("world SDK loading waits for readiness and idle, then starts only once", () => {
  const env = environment();
  let starts = 0;
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    assert.equal(starts, 0);
    assert.deepEqual(env.observations, [{ type: "mark", buffered: true }]);
    env.emit("pm-world:model-parsed");
    assert.equal(env.idle.size, 0);
    env.emit();
    env.emit();
    assert.equal(starts, 0);
    assert.equal(env.idle.size, 1);
    env.flushIdle();
    assert.equal(starts, 1);
    assert.ok(env.disconnected > 0);
    assert.equal(env.timers.size, 0);
    env.emit();
    env.flushIdle();
    assert.equal(starts, 1);
  } finally {
    cancel();
    env.close();
  }
});

void test("reading entry starts analytics without waiting for a world or idle callback", () => {
  const env = environment("#quick/overview");
  let starts = 0;
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    assert.equal(starts, 1);
    assert.equal(env.timers.size, 0);
    assert.equal(env.observations.length, 0);
  } finally {
    cancel();
    env.close();
  }
});

void test("already ready worlds cannot miss the analytics trigger", () => {
  const env = environment();
  env.rememberReady();
  let starts = 0;
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    assert.equal(starts, 0);
    env.flushIdle();
    assert.equal(starts, 1);
  } finally {
    cancel();
    env.close();
  }
});

void test("entering reading mode releases optional loading before world readiness", () => {
  const env = environment();
  let starts = 0;
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    env.dom.window.history.replaceState(null, "", "#quick/roles");
    env.dom.window.dispatchEvent(new env.dom.window.Event("hashchange"));
    env.flushIdle();
    assert.equal(starts, 1);
    assert.equal(env.timers.size, 0);
  } finally {
    cancel();
    env.close();
  }
});

void test("missing timing support still starts analytics through the bounded fallback", () => {
  const env = environment();
  let starts = 0;
  Object.defineProperty(env.dom.window, "PerformanceObserver", {
    value: undefined,
  });
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    assert.equal(starts, 0);
    const fallback = [...env.timers.values()].find(
      (timer) => timer.delay === 15_000,
    );
    assert.ok(fallback);
    fallback.callback();
    env.flushIdle();
    assert.equal(starts, 1);
  } finally {
    cancel();
    env.close();
  }
});

void test("cleanup cancels fallback and queued idle work even if old callbacks arrive", () => {
  const env = environment();
  let starts = 0;
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    env.emit();
    const stale = [...env.idle.values()];
    cancel();
    env.emit();
    for (const callback of stale) callback();
    assert.equal(starts, 0);
    assert.equal(env.idle.size, 0);
    assert.equal(env.timers.size, 0);
  } finally {
    env.close();
  }
});

void test("browsers without idle callbacks use a cancellable task after readiness", () => {
  const env = environment();
  let starts = 0;
  Object.defineProperty(env.dom.window, "requestIdleCallback", {
    value: undefined,
  });
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    env.emit();
    assert.equal(starts, 0);
    const next = [...env.timers.values()].find((timer) => timer.delay === 0);
    assert.ok(next);
    next.callback();
    assert.equal(starts, 1);
  } finally {
    cancel();
    env.close();
  }
});

void test("throwing timing APIs cannot prevent fallback reporting", () => {
  const env = environment();
  let starts = 0;
  Object.defineProperty(env.dom.window.performance, "getEntriesByName", {
    value: () => {
      throw new Error("Timing unavailable");
    },
  });
  Object.defineProperty(env.dom.window, "PerformanceObserver", {
    value: class {
      constructor() {
        throw new Error("Observation unavailable");
      }
    },
  });
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    const fallback = [...env.timers.values()].find(
      (timer) => timer.delay === 15_000,
    );
    assert.ok(fallback);
    fallback.callback();
    env.flushIdle();
    assert.equal(starts, 1);
  } finally {
    cancel();
    env.close();
  }
});

void test("leaving before readiness prevents both the mark and stale fallback from starting analytics", () => {
  const env = environment();
  let starts = 0;
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    const fallback = [...env.timers.values()][0].callback;
    cancel();
    env.emit();
    fallback();
    env.flushIdle();
    assert.equal(starts, 0);
    assert.equal(env.timers.size, 0);
  } finally {
    env.close();
  }
});

void test("a reading button using pushState releases loading without a hashchange event", () => {
  const env = environment();
  let starts = 0;
  const cancel = scheduleExperienceAnalytics(() => starts++);
  try {
    const button = env.dom.window.document.createElement("button");
    button.addEventListener("click", () =>
      env.dom.window.history.pushState(null, "", "#quick/overview"),
    );
    env.dom.window.document.body.append(button);
    button.click();
    env.flushIdle();
    assert.equal(starts, 1);
  } finally {
    cancel();
    env.close();
  }
});
