import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { Observatory } from "../components/pm-intelligence-world/Observatory";
import { worldContent } from "../content/pm-intelligence-world/content";

void test("a page remount restores source inspection, and restart clears that session", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const document = dom.window.document;
  Object.assign(globalThis, {
    window: dom.window,
    document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let root = createRoot(document.getElementById("root")!);
  const mount = async () => {
    await act(async () =>
      root.render(
        <Observatory active={false} content={worldContent} onRead={() => {}} />,
      ),
    );
  };
  const click = async (name: string) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) =>
        b.getAttribute("aria-label") === name ||
        (name === "Open expedition guide" &&
          b.getAttribute("aria-label")?.endsWith(name)) ||
        b.textContent?.trim() === name,
    );
    assert.ok(button, name);
    await act(async () => button.click());
  };
  try {
    await mount();
    await click("Open expedition guide");
    await click("02Hands-on projects");
    await click("Inspect source & interpretation");
    assert.match(
      [...document.querySelectorAll('[role="status"]')].find((e) =>
        e.textContent?.includes("milestones"),
      )!.textContent!,
      /1 \/ 6/,
    );
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root")!);
    await mount();
    assert.match(
      [...document.querySelectorAll('[role="status"]')].find((e) =>
        e.textContent?.includes("milestones"),
      )!.textContent!,
      /1 \/ 6/,
    );
    await click("Open expedition guide");
    await click("Restart first expedition");
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root")!);
    await mount();
    assert.match(
      [...document.querySelectorAll('[role="status"]')].find((e) =>
        e.textContent?.includes("milestones"),
      )!.textContent!,
      /0 \/ 6/,
    );
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
  }
});
