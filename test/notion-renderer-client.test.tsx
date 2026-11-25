import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import {
  PROSE_PAGE_ID,
  proseRecordMap,
} from "./fixtures/notion-prose-record-map";

async function exerciseRenderer(t: TestContext, hydrate: boolean) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div class="notion-frame" id="root"></div></body></html>',
    { url: "https://example.invalid" },
  );
  const names = [
    "window",
    "self",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLImageElement",
    "Node",
    "Element",
    "Document",
    "DocumentFragment",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IS_REACT_ACT_ENVIRONMENT",
    "fetch",
  ];
  const old = new Map(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const name of names) {
    const value =
      name === "IS_REACT_ACT_ENVIRONMENT"
        ? true
        : name === "fetch"
          ? async () => {
              assert.fail("renderer tests must not fetch external data");
            }
          : name === "requestAnimationFrame"
            ? (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0)
            : name === "cancelAnimationFrame"
              ? clearTimeout
              : (dom.window as unknown as Record<string, unknown>)[name];
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  }
  t.after(() => {
    dom.window.close();
    for (const name of names) {
      const d = old.get(name);
      if (d) Object.defineProperty(globalThis, name, d);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const id = PROSE_PAGE_ID;
  const map = proseRecordMap();
  const { NotionPageRenderer } =
    await import("../components/NotionPageRenderer");
  const container = dom.window.document.getElementById("root")!;
  const errors: unknown[] = [];
  let root: ReturnType<typeof createRoot> | undefined;
  const element = createElement(NotionPageRenderer, {
    recordMap: map,
    pageId: id,
    rootPageId: id,
    fullPage: true,
    components: hydrate ? undefined : { Header: () => null },
  });
  // Hydrate exactly what the server sends, prose included.
  if (hydrate) container.innerHTML = renderToString(element);
  try {
    await act(async () => {
      if (hydrate)
        root = hydrateRoot(container, element, {
          onRecoverableError: (error) => errors.push(error),
        });
      else {
        root = createRoot(container);
        root.render(element);
      }
    });
    for (
      let i = 0;
      i < 30 &&
      (!container.querySelector(".katex") ||
        !container.querySelector(".notion-code .token"));
      i++
    )
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    assert.equal(
      Boolean(container.querySelector("header.notion-header")),
      hydrate,
      "the page header mounts by default and the side-peek override hides it",
    );
    assert.match(container.textContent ?? "", /Deferred prose survives/);
    assert.match(container.textContent ?? "", /const fixtureValue = 7/);
    assert.ok(
      container.querySelector(".katex"),
      "the actual equation renderer must still run after mount",
    );
    assert.ok(
      container.querySelector(".notion-code .token"),
      "JavaScript must retain actual syntax highlighting",
    );
    assert.equal(
      container.querySelectorAll(".notion-equation .katex").length,
      2,
      "block and inline equations must both upgrade to KaTeX",
    );
    assert.deepEqual(
      errors,
      [],
      "the server HTML must hydrate without recovery",
    );
  } finally {
    await act(async () => root?.unmount());
  }
}

void test("the deferred renderer still mounts Notion prose math and syntax-highlighted code", async (t) => {
  await exerciseRenderer(t, false);
});
void test("the server-rendered prose hydrates and upgrades code and math without recovery", async (t) => {
  await exerciseRenderer(t, true);
});
