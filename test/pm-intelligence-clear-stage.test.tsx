import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";
import { act, useReducer } from "react";
import { createRoot } from "react-dom/client";

import { Observatory } from "../components/pm-intelligence-world/Observatory";
import { ObservatoryInstrument } from "../components/pm-intelligence-world/ObservatoryInstrument";
import { activityDefinitions } from "../content/pm-intelligence-world/activities";
import { worldContent } from "../content/pm-intelligence-world/content";
import {
  emptyActivity,
  initialObservatoryState,
  observatoryReducer,
} from "../lib/pm-intelligence-world/observatory-state";

const normalize = (value: string) => value.replaceAll(/\s+/g, "").toLowerCase();

async function withDOM(
  run: (
    document: Document,
    click: (name: string) => Promise<void>,
  ) => Promise<void>,
  instrument = false,
) {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='test-root'></div></body></html>",
  );
  const document = dom.window.document as Document;
  Object.assign(globalThis, {
    window: dom.window,
    document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(document.getElementById("test-root")!);
  function Tool() {
    const [state, dispatch] = useReducer(observatoryReducer, {
      ...initialObservatoryState,
      location: "writing" as const,
      selected: "external-signals" as const,
      connected: ["external-signals" as const],
    });
    return (
      <ObservatoryInstrument
        destination="writing"
        source="external-signals"
        progress={
          state.activities["external-signals"]?.writing ?? emptyActivity
        }
        dispatch={dispatch}
        onClose={() => {}}
        onRecord={() => {}}
      />
    );
  }
  const click = async (name: string) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) =>
        b.getAttribute("aria-label") === name ||
        (name === "Open expedition guide" &&
          b.getAttribute("aria-label")?.endsWith(name)) ||
        b.textContent?.trim() === name,
    );
    assert.ok(button, `Missing button: ${name}`);
    button.focus();
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(
        instrument ? (
          <Tool />
        ) : (
          <Observatory
            active={false}
            content={worldContent}
            onRead={() => {}}
          />
        ),
      ),
    );
    await run(document, click);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
  }
}

void test("exploration keeps sources and historical titles behind one explicit guide/inspection", async () => {
  await withDOM(async (document, click) => {
    assert.equal(
      document.querySelector('[aria-label="Three sources of knowledge"]') ===
        null,
      true,
    );
    await click("Open expedition guide");
    assert.ok(document.querySelector('[aria-label="Expedition guide"]'));
    assert.equal(
      document.querySelectorAll(
        '[aria-label="Three sources of knowledge"] button',
      ).length,
      3,
    );
    await click("01External signals");
    assert.equal(
      document.querySelector('[aria-label="Expedition guide"]'),
      null,
    );
    const panel = document.querySelector(
      '[aria-label="Context at current place"]',
    )!;
    assert.ok(panel);
    assert.equal(
      panel.querySelector("h2")!.textContent,
      "From a signal to reusable knowledge",
    );
    const evidence = [...panel.querySelectorAll("details")].find((d) =>
      d.textContent?.includes("Trust Recovery"),
    );
    assert.ok(evidence);
    assert.equal(evidence.open, false);
    assert.equal(
      document.querySelector<HTMLElement>(
        '[aria-label="Expedition navigation"]',
      )?.hidden,
      true,
    );
    await click("Close inspection");
    assert.equal(
      document.querySelector('[aria-label="Context at current place"]'),
      null,
    );
    assert.equal(
      document.querySelector<HTMLElement>(
        '[aria-label="Expedition navigation"]',
      )?.hidden,
      false,
    );
    assert.equal(
      document.activeElement?.hasAttribute("data-observatory-start"),
      true,
    );
  });
});

void test("the guide name includes its visible progress and motion can be paused without losing the overview", async () => {
  await withDOM(async (document, click) => {
    const guide = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.trim().startsWith("Guide"),
    )!;
    assert.ok(
      normalize(guide.getAttribute("aria-label")!).includes(
        normalize(guide.textContent!),
      ),
    );
    const first = document.querySelector("button, a[href]")!;
    assert.equal(first.textContent, "Skip to system overview");
    await click(guide.getAttribute("aria-label")!);
    await click("Pause motion");
    assert.equal(
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Resume motion")
        ?.getAttribute("aria-pressed"),
      "true",
    );
  });
});

void test("a selected teaching card folds away while the 3D instrument remains armed", async () => {
  await withDOM(async (document, click) => {
    const label = activityDefinitions.writing.stages[0]!.options[0]!.label;
    await click(label);
    assert.equal(
      document.activeElement?.textContent?.trim(),
      "Press the argument",
    );
    assert.equal(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === label,
      ),
      false,
    );
    assert.ok(
      document.querySelector('[aria-label="Operate Viewpoint press"]') ||
        document.querySelector("aside"),
    );
    await click("Change card");
    assert.equal(document.activeElement?.textContent?.trim(), label);
    assert.ok(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === label,
      ),
    );
  }, true);
});
