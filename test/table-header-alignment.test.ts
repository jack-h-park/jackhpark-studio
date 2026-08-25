import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const css = readFileSync(
  path.join(process.cwd(), "styles/ai-design-system.css"),
  "utf8",
);

function horizontalPadding(selector: string): string {
  const block = css.slice(css.indexOf(`${selector} {`));
  const body = block.slice(0, block.indexOf("}"));
  const declaration = /padding:\s*([^;]+);/.exec(body);
  assert.ok(declaration, `${selector} declares no padding`);
  const parts = declaration[1].trim().split(/\s+/);
  // `padding: <v>` → all sides; `padding: <y> <x>` → second value is horizontal.
  return parts.length === 1 ? parts[0] : parts[1];
}

/**
 * A column header is read as the label of the data beneath it. If the two carry different
 * horizontal padding, every row reads as slightly crooked — and because these classes are
 * shared, it happens on every table on the site at once.
 *
 * That is what shipped: the header sat at 0.5rem against the cell's 1rem, so every
 * left-aligned label was 8px to the left of its own column. Cheap to reintroduce by tuning
 * one of the two, which is why the pairing is asserted rather than described.
 */
void describe("table header and cell share a horizontal edge", () => {
  void it("gives the header and the cell the same horizontal padding", () => {
    assert.equal(
      horizontalPadding(".ai-table__header"),
      horizontalPadding(".ai-table__cell"),
      "a header must start on the same edge as the data it labels",
    );
  });

  void it("keeps the pairing documented where someone would change it", () => {
    // A number that must match another number needs to say so at the site of the edit.
    const headerBlock = css.slice(css.indexOf(".ai-table__header {"));
    assert.match(
      headerBlock.slice(0, headerBlock.indexOf("}")),
      /MUST equal .ai-table__cell/,
      "the header rule must say the padding is paired",
    );
  });

  void it("is not overridden by the jp theme", () => {
    // The theme restyles table headers; if it also set padding, the pairing would hold in
    // one theme and break in the other.
    const theme = readFileSync(
      path.join(process.cwd(), "styles/jp-theme.css"),
      "utf8",
    );
    const themed = theme.slice(theme.indexOf('.ai-table__header'));
    assert.doesNotMatch(
      themed.slice(0, themed.indexOf("}")),
      /padding/,
      "the jp theme must not set table header padding independently",
    );
  });
});
