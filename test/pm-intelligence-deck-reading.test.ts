import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { JSDOM } from "jsdom";

const html = readFileSync(
  new URL("../public/decks/pm-intelligence-system/index.html", import.meta.url),
  "utf8",
);

function openDeck(width: number) {
  // The repository's minimal jsdom declaration covers server parsing only.
  const RuntimeDOM = JSDOM as unknown as new (
    source: string,
    options: { runScripts: string; pretendToBeVisual: boolean; url: string },
  ) => { window: Window & typeof globalThis };
  const dom = new RuntimeDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "http://localhost/decks/pm-intelligence-system",
  });
  const { window } = dom;
  Object.defineProperty(window, "innerWidth", { value: width, writable: true });
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width") && window.innerWidth <= 800,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  window.Element.prototype.animate = (() => ({
    cancel() {},
    finish() {},
    pause() {},
    play() {},
    playState: "finished",
  })) as unknown as typeof window.Element.prototype.animate;
  for (const script of window.document.querySelectorAll("script:not([type])"))
    window.eval(script.textContent!);
  return { dom, window, document: window.document };
}

void test("interactive deck cards preserve the visible wording in their accessible names", async () => {
  const { dom, document } = openDeck(390);
  try {
    const normalize = (value: string) =>
      value.replaceAll(/\s+/g, "").toLowerCase();
    const cards = document.querySelectorAll<HTMLElement>(
      "[data-explore-index]",
    );
    assert.ok(cards.length > 15);
    for (const card of cards) {
      const visible = normalize(card.textContent || "");
      const name = normalize(
        card.getAttribute("aria-label") || card.textContent || "",
      );
      assert.ok(name.includes(visible), card.outerHTML.slice(0, 300));
    }
  } finally {
    await new Promise<void>((resolve) => setImmediate(resolve));
    dom.window.close();
  }
});

void test("phones read the full canonical scene and switch views without losing position", async () => {
  const { dom, window, document } = openDeck(390);
  try {
    assert.equal(document.body.dataset.deckReading, "true");
    const next = document.querySelector<HTMLButtonElement>(
      '[aria-label="Next slide"]',
    )!;
    next.click();
    assert.equal(
      document.querySelector<HTMLElement>(".slide.active")?.dataset.slide,
      "S02",
    );
    const viewport = document.querySelector<HTMLElement>(".deck-viewport")!;
    viewport.scrollTop = 300;
    window.dispatchEvent(new window.WheelEvent("wheel", { deltaY: 150 }));
    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "PageDown", bubbles: true }),
    );
    assert.equal(
      document.querySelector<HTMLElement>(".slide.active")?.dataset.slide,
      "S02",
    );
    const toggle =
      document.querySelector<HTMLButtonElement>(".reading-toggle")!;
    toggle.click();
    assert.equal(document.body.dataset.deckReading, "false");
    assert.equal(
      document.querySelector<HTMLElement>(".slide.active")?.dataset.slide,
      "S02",
    );
    toggle.click();
    assert.equal(document.body.dataset.deckReading, "true");
    next.click();
    assert.equal(viewport.scrollTop, 0);
    assert.equal(
      document.querySelector<HTMLElement>(".slide.active")?.dataset.slide,
      "S03",
    );
    assert.equal(
      document.querySelectorAll('.slide[aria-hidden="false"]').length,
      1,
    );
    assert.match(
      document.querySelector<HTMLElement>(".slide.active")!.textContent!,
      /.+/,
    );
    Object.defineProperty(window, "innerWidth", {
      value: 1280,
      writable: true,
    });
    window.dispatchEvent(new window.Event("resize"));
    assert.equal(
      document.body.dataset.deckReading,
      "true",
      "an explicit choice survives rotation",
    );
  } finally {
    // Let the real scene observers settle before jsdom tears down its document.
    await new Promise<void>((resolve) => setImmediate(resolve));
    dom.window.close();
  }
});

void test("reading scroll keys do not change scenes while a toolbar button has focus", async () => {
  const { dom, window, document } = openDeck(390);
  try {
    const next = document.querySelector<HTMLButtonElement>(
      '[aria-label="Next slide"]',
    )!;
    next.click();
    for (const control of [
      next,
      document.querySelector<HTMLButtonElement>(".reading-toggle")!,
    ]) {
      control.focus();
      for (const key of [
        "PageDown",
        "PageUp",
        "Home",
        "End",
        "ArrowDown",
        "ArrowUp",
      ]) {
        control.dispatchEvent(
          new window.KeyboardEvent("keydown", { key, bubbles: true }),
        );
        assert.equal(
          document.querySelector<HTMLElement>(".slide.active")?.dataset.slide,
          "S02",
          key,
        );
      }
    }
  } finally {
    // Let the real scene observers settle before jsdom tears down its document.
    await new Promise<void>((resolve) => setImmediate(resolve));
    dom.window.close();
  }
});

void test("desktop retains slide defaults and reading scroll keys do not navigate", async () => {
  const { dom, window, document } = openDeck(1280);
  try {
    const readingToggle =
      document.querySelector<HTMLButtonElement>(".reading-toggle")!;
    assert.ok(
      readingToggle
        .getAttribute("aria-label")!
        .toLowerCase()
        .includes(readingToggle.textContent!.toLowerCase()),
    );
    assert.equal(document.body.dataset.deckReading, "false");
    document.body.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    assert.equal(
      document.querySelector<HTMLElement>(".slide.active")?.dataset.slide,
      "S02",
    );
    document.querySelector<HTMLButtonElement>(".reading-toggle")!.click();
    for (const key of [
      " ",
      "PageDown",
      "PageUp",
      "Home",
      "End",
      "ArrowDown",
      "ArrowUp",
    ]) {
      document.body.dispatchEvent(
        new window.KeyboardEvent("keydown", { key, bubbles: true }),
      );
      assert.equal(
        document.querySelector<HTMLElement>(".slide.active")?.dataset.slide,
        "S02",
        key,
      );
    }
    document
      .querySelector<HTMLButtonElement>('[aria-label="Previous slide"]')!
      .click();
    assert.equal(
      document.querySelector<HTMLElement>(".slide.active")?.dataset.slide,
      "S01",
    );
  } finally {
    // Let the real scene observers settle before jsdom tears down its document.
    await new Promise<void>((resolve) => setImmediate(resolve));
    dom.window.close();
  }
});
