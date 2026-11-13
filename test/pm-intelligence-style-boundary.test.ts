import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import postcss from "postcss";

function expanded(file: string): string {
  return readFileSync(file, "utf8").replaceAll(
    /@import\s+"([^"]+)";/g,
    (_match, imported: string) =>
      expanded(path.resolve(path.dirname(file), imported)),
  );
}

void test("the experience uses every required shared primitive without the full utility/control bundle", () => {
  const css = expanded(path.resolve("styles/pm-intelligence.css"));
  const root = postcss.parse(css);
  const selectors: string[] = [];
  root.walkRules((rule) => {
    selectors.push(rule.selector);
  });
  const content = readdirSync("components/pm-intelligence-world")
    .filter((file) => file.endsWith(".tsx"))
    .map((file) =>
      readFileSync(path.join("components/pm-intelligence-world", file), "utf8"),
    )
    .join("\n");
  const required = new Set(content.match(/\bai-[a-z][a-z0-9-]+/g));
  assert.ok(required.size > 0);
  for (const name of required)
    assert.ok(
      selectors.some((selector) =>
        selector.split(",").some((part) => part.trim() === `.${name}`),
      ),
      `${name} needs its canonical shared rules`,
    );
  assert.ok(!selectors.includes(".ai-table__cell"));
  assert.ok(!selectors.includes(".ai-switch"));
  const tailwindLayers: string[] = [];
  root.walkAtRules("tailwind", (rule) => {
    tailwindLayers.push(rule.params);
  });
  assert.deepEqual(tailwindLayers, ["base"]);
  assert.match(css, /--ai-role-border-selected:/);
});

void test("the full Pages aggregator retains the other canonical primitives and Tailwind layers", () => {
  const root = postcss.parse(
    expanded(path.resolve("styles/ai-design-system.css")),
  );
  const selectors: string[] = [];
  root.walkRules((rule) => {
    selectors.push(rule.selector);
  });
  for (const name of [
    ".ai-table__cell",
    ".ai-table__header",
    ".ai-switch",
    ".ai-button",
    ".ai-field",
  ])
    assert.ok(
      selectors.includes(name),
      `${name} remains available to existing pages`,
    );
  const layers: string[] = [];
  root.walkAtRules("tailwind", (rule) => {
    layers.push(rule.params);
  });
  assert.deepEqual(layers, ["base", "components", "utilities"]);
});
