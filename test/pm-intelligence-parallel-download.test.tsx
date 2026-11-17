import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { Observatory } from "../components/pm-intelligence-world/Observatory";
import { useCampusDownload } from "../components/pm-intelligence-world/useCampusDownload";
import { worldContent } from "../content/pm-intelligence-world/content";

void test("the world starts its model before the lazy scene is available and owns request cancellation", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost/experiences/pm-intelligence#quick/overview",
  });
  const keys = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const requests: { url: string; signal: AbortSignal }[] = [];
  t.mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
    const signal = init.signal!;
    requests.push({ url, signal });
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () =>
        reject(new DOMException("Cancelled", "AbortError")),
      );
    });
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = (active: boolean, initialized = true) =>
    act(async () => {
      root.render(
        <Observatory
          active={active}
          initialized={initialized}
          content={worldContent}
          onRead={() => {}}
        />,
      );
    });
  try {
    await render(false);
    await render(true, false);
    assert.equal(
      requests.length,
      0,
      "Reading and pre-hydration must not fetch",
    );
    await render(true);
    assert.equal(dom.window.document.querySelector("canvas"), null);
    assert.equal(
      requests.length,
      1,
      "Fetch must start without the Three scene",
    );
    assert.equal(
      requests[0].url,
      "/experiences/pm-intelligence/observatory/campus.glb.gz",
    );
    await render(true);
    assert.equal(
      requests.length,
      1,
      "An ordinary rerender must reuse the request",
    );
    await render(false);
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(requests.length, 1, "An aborted download must not fall back");
    await render(true);
    assert.equal(requests.length, 2, "Returning needs a fresh, usable request");
    assert.equal(requests[1].signal.aborted, false);
  } finally {
    await act(async () => root.unmount());
    if (requests[1]) assert.equal(requests[1].signal.aborted, true);
    dom.window.close();
    for (const [index, key] of keys.entries()) {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

void test("an early failed model remains rejected for the late consumer and a return can retry", async (t) => {
  const dom = new JSDOM("<div id='root'></div>");
  const keys = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(null, { status: 404 });
  });
  const captured: Promise<ArrayBuffer>[] = [];
  function Probe({ enabled }: { enabled: boolean }) {
    const data = useCampusDownload(enabled);
    if (data && !captured.includes(data)) captured.push(data);
    return null;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<Probe enabled />));
    // The effect and both failed fetches have already run before the consumer
    // attaches. Node's test runner also rejects unhandled promise rejections.
    assert.equal(requests, 2);
    assert.equal(captured.length, 1);
    await assert.rejects(captured[0], /404/);
    await act(async () => root.render(<Probe enabled={false} />));
    await act(async () => root.render(<Probe enabled />));
    assert.equal(requests, 4);
    assert.equal(captured.length, 2);
    assert.notEqual(captured[0], captured[1]);
    await assert.rejects(captured[1], /404/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [index, key] of keys.entries()) {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
