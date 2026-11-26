import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveStatusPillTone } from "@/components/ui/status-pill";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** First declaration of a custom property inside the first block matching `selector`. */
function tokenIn(css: string, selector: string, token: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start !== -1, `selector ${selector} not found`);
  const block = css.slice(start, css.indexOf("}", start));
  const at = block.indexOf(`${token}:`);
  assert.ok(at !== -1, `${token} not declared in ${selector}`);
  return block
    .slice(at + token.length + 1, block.indexOf(";", at))
    .trim()
    .toLowerCase();
}

// Values from the shared app kit (workspace-governance docs/ux/kit/jhp-app-theme.css).
const KIT_LIGHT = {
  "--ai-info": "#0b6e99",
  "--ai-success": "#3b6d11",
  "--ai-warning": "#ba7517",
  "--ai-warning-text": "#8f5a0e",
  "--ai-error": "#a32d2d",
  "--ai-radius-sm": "6px",
  "--ai-radius-md": "10px",
  "--ai-radius-lg": "14px",
};

const KIT_JP_LIGHT = {
  "--accent-info": "#0b6e99",
  "--accent-success": "#3b6d11",
  "--accent-warning": "#ba7517",
  "--accent-warning-text": "#8f5a0e",
  "--accent-danger": "#a32d2d",
};

void describe("brand tokens outside the J·P scope", () => {
  const tokens = read("styles/primitives/ai-tokens.css");

  for (const [token, value] of Object.entries(KIT_LIGHT)) {
    void it(`${token} equals the kit value`, () => {
      assert.strictEqual(tokenIn(tokens, ":root", token), value);
    });
  }
});

void describe("brand tokens inside the J·P scope", () => {
  const jp = read("styles/jp-theme.css");

  for (const [token, value] of Object.entries(KIT_JP_LIGHT)) {
    void it(`${token} equals the kit value`, () => {
      assert.strictEqual(tokenIn(jp, '[data-theme="jp"]', token), value);
    });
  }
});

void describe("StatusPill tone names", () => {
  void it("accepts the guideline names", () => {
    for (const tone of [
      "neutral",
      "info",
      "success",
      "warning",
      "danger",
    ] as const) {
      assert.strictEqual(resolveStatusPillTone(tone), tone);
    }
  });

  void it("keeps muted and error as aliases", () => {
    assert.strictEqual(resolveStatusPillTone("muted"), "neutral");
    assert.strictEqual(resolveStatusPillTone("error"), "danger");
  });
});
