import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { JSDOM } from "jsdom";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { Experience } from "../components/pm-intelligence-world/Experience";
import { worldContent } from "../content/pm-intelligence-world/content";
import {
  initialViewScript,
  isReadingFragment,
} from "../lib/pm-intelligence-world/navigation";

void test("the first-paint bootstrap chooses the same view as client routing without downloading 3D", () => {
  for (const [hash, expected] of [
    ["", "observatory"],
    ["#observatory", "observatory"],
    ["#", "observatory"],
    ["#quick/overview", "reading"],
    ["#explore/roles", "reading"],
  ]) {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    try {
      runInNewContext(initialViewScript, {
        document: dom.window.document,
        location: { hash },
      });
      assert.equal(
        dom.window.document.documentElement.dataset.pmInitialView,
        expected,
      );
      assert.equal(isReadingFragment(hash), expected === "reading");
      assert.equal(
        dom.window.document.querySelectorAll("script,link,canvas").length,
        0,
      );
    } finally {
      dom.window.close();
    }
  }
});

void test("client routing releases first-paint visibility and can return to the world", async () => {
  const html = renderToString(<Experience content={worldContent} />);
  const dom = new JSDOM(`<div id="root">${html}</div>`, {
    url: "http://localhost/experiences/pm-intelligence#quick/overview",
  });
  const runtimeWindow = dom.window as unknown as Window & typeof globalThis;
  const document = runtimeWindow.document;
  runInNewContext(initialViewScript, {
    document,
    location: dom.window.location,
  });
  assert.equal(document.documentElement.dataset.pmInitialView, "reading");
  const keys = [
    "window",
    "document",
    "location",
    "history",
    "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const previous = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document,
    location: dom.window.location,
    history: dom.window.history,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.scrollTo = () => {};
  const focuses: { id: string; preventScroll?: boolean }[] = [];
  const originalFocus = runtimeWindow.HTMLElement.prototype.focus;
  runtimeWindow.HTMLElement.prototype.focus = function (
    this: HTMLElement,
    options?: FocusOptions,
  ) {
    focuses.push({
      id: this.id,
      preventScroll: options?.preventScroll ?? false,
    });
    originalFocus.call(this, options);
  };
  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(
        document.getElementById("root")!,
        <Experience content={worldContent} />,
      );
    });
    assert.equal(
      Object.hasOwn(document.documentElement.dataset, "pmInitialView"),
      false,
    );
    const world = document.querySelector(
      'section[aria-label="Signal Observatory — PM Intelligence System"]',
    );
    assert.ok(world);
    assert.ok(world.hasAttribute("hidden"));
    assert.equal(document.querySelector('link[as="fetch"]'), null);
    assert.equal(
      focuses.find((f) => f.id === "heading-overview"),
      undefined,
      "Hydration must not steal focus or scroll away from the introduction",
    );
    const chapter = document.querySelector<HTMLAnchorElement>(
      'a[href="#quick/writing"]',
    );
    assert.ok(chapter);
    await act(async () => chapter.click());
    assert.deepEqual(
      focuses.find((f) => f.id === "heading-writing"),
      { id: "heading-writing", preventScroll: false },
    );
    const back = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Back to observatory",
    );
    assert.ok(back);
    await act(async () => back.click());
    assert.equal(world.hasAttribute("hidden"), false);
    assert.equal(dom.window.location.hash, "#observatory");
  } finally {
    await act(async () => root?.unmount());
    dom.window.close();
    for (const key of keys) {
      const value = previous.get(key);
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
