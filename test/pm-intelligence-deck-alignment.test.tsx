import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ReadingView } from "../components/pm-intelligence-world/ReadingView";
import { worldContent } from "../content/pm-intelligence-world/content";
import { initialState } from "../lib/pm-intelligence-world/state";

void test("the companion names the maintained Wiki, explanations and role-specific responsibility", () => {
  const section = (id: string) =>
    worldContent.sections.find((s) => s.id === id)!;
  assert.match(section("knowledge").summary, /LLM Wiki/);
  assert.equal(section("questions").navLabel, "Explanations");
  assert.match(section("questions").summary, /project/);
  assert.equal(
    worldContent.roles.find((r) => r.name === "Vega")?.role,
    "Operational health",
  );
  assert.match(
    worldContent.roles.find((r) => r.name === "Quill")!.prepares,
    /project.*public/i,
  );
  assert.ok(worldContent.roles.some((r) => r.name === "Sera"));
  assert.ok(worldContent.roles.some((r) => r.name === "Nora"));
  const html = renderToStaticMarkup(
    <ReadingView
      content={worldContent}
      state={initialState}
      dispatch={() => {}}
    />,
  );
  assert.ok(html.includes('href="/decks/pm-intelligence-system"'));
  assert.match(html, /purpose, responsibilities/);
  assert.match(html, /curation/);
  assert.match(html, /does not automatically/);
  assert.match(html, /publication/);
  assert.match(html, /rehears/);
  assert.match(html, /not a mandatory chain/i);
});

void test("the local deck and observatory use reciprocal same-origin links", () => {
  assert.equal(worldContent.links.deck, "/decks/pm-intelligence-system");
  const deck = readFileSync(
    new URL(
      "../public/decks/pm-intelligence-system/index.html",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(deck, /href="\/experiences\/pm-intelligence#observatory"/);
  assert.match(deck, /Explore in 3D ↗/);
  assert.equal((deck.match(/data-slide="S\d+"/g) ?? []).length, 15);
  assert.ok(!deck.includes("V2 · REVIEW DRAFT"));
});

void test("the clean deck URL resolves its generated index before page routing", async () => {
  const { default: config } = await import("../next.config.js");
  assert.equal(typeof config.rewrites, "function");
  assert.ok(config.rewrites);
  const rules = await config.rewrites();
  assert.ok(!Array.isArray(rules));
  assert.deepEqual(rules.beforeFiles, [
    {
      source: "/decks/pm-intelligence-system",
      destination: "/decks/pm-intelligence-system/index.html",
    },
  ]);
});
