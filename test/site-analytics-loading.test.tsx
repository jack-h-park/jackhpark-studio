import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { GoogleAnalyticsBootstrap } from "../components/analytics/GoogleAnalyticsBootstrap";
import { ExperienceAnalytics } from "../components/pm-intelligence-world/ExperienceAnalytics";
import { installGoogleAnalyticsLoader } from "../lib/analytics/google-loader";

void test("the shared bootstrap queues the initial pageview for either router", () => {
  const html = renderToStaticMarkup(
    <GoogleAnalyticsBootstrap trackingId="G-TEST" />,
  );
  const dom = new JSDOM(html, {
    url: "http://localhost/experiences/pm-intelligence#quick/overview",
  });
  const scope = {
    window: dom.window,
    get dataLayer() {
      return Reflect.get(dom.window, "dataLayer");
    },
  };
  runInNewContext(
    dom.window.document.querySelector("script")!.textContent!,
    scope,
  );
  const calls = Array.from(
    Reflect.get(dom.window, "dataLayer") as IArguments[],
  ).map((args) => Array.from(args));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].slice(0, 2), ["config", "G-TEST"]);
  assert.equal(
    Reflect.get(calls[1][2] as object, "page_path"),
    "/experiences/pm-intelligence",
  );
  assert.equal(
    renderToStaticMarkup(<GoogleAnalyticsBootstrap trackingId="" />),
    "",
  );
  dom.window.close();
});

void test("Google analytics waits for interaction or ten seconds, deduplicates and cleans up", (t) => {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body></body></html>",
  );
  const keys = ["window", "document"] as const;
  const previous = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  });
  const pending: (() => void)[] = [];
  t.mock.method(
    dom.window,
    "setTimeout",
    (callback: () => void, duration: number) => {
      assert.equal(duration, 10_000);
      pending.push(callback);
      return pending.length;
    },
  );
  const cleared: number[] = [];
  t.mock.method(dom.window, "clearTimeout", (id: number) => cleared.push(id));
  const idle: (() => void)[] = [];
  Object.defineProperty(dom.window, "requestIdleCallback", {
    value: (callback: () => void) => idle.push(callback),
    configurable: true,
  });
  try {
    const cleanup = installGoogleAnalyticsLoader("G-TEST");
    assert.equal(dom.window.document.querySelectorAll("script").length, 0);
    dom.window.dispatchEvent(new dom.window.Event("pointerdown"));
    assert.equal(dom.window.document.querySelectorAll("script").length, 0);
    assert.equal(idle.length, 1);
    idle[0]();
    assert.equal(dom.window.document.querySelectorAll("script").length, 1);
    assert.ok(
      dom.window.document.querySelector("script")!.src.endsWith("?id=G-TEST"),
    );
    dom.window.dispatchEvent(new dom.window.Event("keydown"));
    assert.equal(idle.length, 1);
    assert.equal(installGoogleAnalyticsLoader("G-TEST"), undefined);
    cleanup?.();
    dom.window.document.querySelector("script")!.remove();
    const cancel = installGoogleAnalyticsLoader("G-TEST");
    pending.at(-1)!();
    idle.at(-1)!();
    assert.equal(dom.window.document.querySelectorAll("script").length, 1);
    cancel?.();
    assert.ok(cleared.length >= 2);
  } finally {
    dom.window.close();
    for (const [index, key] of keys.entries()) {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

void test("the experience registers GA before the optional SDK chunk is available", async (t) => {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  );
  const keys = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const previousId = process.env.NEXT_PUBLIC_GA_ID;
  process.env.NEXT_PUBLIC_GA_ID = "G-EARLY";
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const durations: number[] = [];
  t.mock.method(
    dom.window,
    "setTimeout",
    (_callback: () => void, duration: number) => {
      durations.push(duration);
      return durations.length;
    },
  );
  const idle: (() => void)[] = [];
  Object.defineProperty(dom.window, "requestIdleCallback", {
    value: (callback: () => void) => idle.push(callback),
    configurable: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<ExperienceAnalytics />));
    assert.ok(
      durations.includes(10_000),
      "Fallback starts at experience hydration, independently of the SDK chunk",
    );
    dom.window.dispatchEvent(new dom.window.Event("pointerdown"));
    assert.equal(
      idle.length,
      1,
      "The first interaction must be captured before the SDK loads",
    );
    idle[0]();
    assert.ok(dom.window.document.getElementById("gtag-js"));
  } finally {
    await act(async () => root.unmount());
    if (previousId === undefined) delete process.env.NEXT_PUBLIC_GA_ID;
    else process.env.NEXT_PUBLIC_GA_ID = previousId;
    dom.window.close();
    for (const [index, key] of keys.entries()) {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
