import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type { ExtendedRecordMap } from "notion-types";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

async function exerciseRenderer(t: TestContext, hydrate: boolean) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div class="notion-frame" id="root"></div></body></html>',
    { url: "https://example.invalid" },
  );
  const names = [
    "window",
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
  const id = "11111111-1111-4111-8111-111111111111";
  const common = {
    alive: true,
    version: 1,
    created_time: 0,
    last_edited_time: 0,
    parent_id: id,
    parent_table: "block",
  };
  const map = {
    block: {
      [id]: {
        role: "reader",
        value: {
          ...common,
          id,
          parent_id: "fixture-space",
          parent_table: "space",
          type: "page",
          properties: { title: [["Offline fixture"]] },
          content: ["text", "code", "math"],
          format: { page_icon: "🧪" },
        },
      },
      text: {
        role: "reader",
        value: {
          ...common,
          id: "text",
          type: "text",
          properties: { title: [["Deferred prose survives"]] },
        },
      },
      code: {
        role: "reader",
        value: {
          ...common,
          id: "code",
          type: "code",
          properties: {
            title: [["const fixtureValue = 7;"]],
            language: [["JavaScript"]],
          },
        },
      },
      math: {
        role: "reader",
        value: {
          ...common,
          id: "math",
          type: "equation",
          properties: { title: [["x^2 + y^2"]] },
        },
      },
    },
    collection: {},
    collection_view: {},
    collection_query: {},
    notion_user: {},
    signed_urls: {},
  } as unknown as ExtendedRecordMap;
  const { NotionPageRenderer } =
    await import("../components/NotionPageRenderer");
  const container = dom.window.document.getElementById("root")!;
  const errors: unknown[] = [];
  let root: ReturnType<typeof createRoot> | undefined;
  if (hydrate)
    container.innerHTML =
      '<div class="notion-wrapper"><div class="notion-frame"></div></div>';
  try {
    await act(async () => {
      const element = createElement(NotionPageRenderer, {
        recordMap: map,
        pageId: id,
        rootPageId: id,
        fullPage: true,
      });
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
    assert.deepEqual(
      errors,
      [],
      "the preserved frame must hydrate without recovery",
    );
  } finally {
    await act(async () => root?.unmount());
  }
}

void test("the deferred renderer still mounts Notion prose math and syntax-highlighted code", async (t) => {
  await exerciseRenderer(t, false);
});
void test("the empty server frame hydrates into the real Notion renderer without recovery", async (t) => {
  await exerciseRenderer(t, true);
});
