import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();
const source = readFileSync(
  path.join(repoRoot, "lib/admin/manual-ingestor.ts"),
  "utf8",
);
const adminGuide = readFileSync(
  path.join(repoRoot, "docs/operations/admin-guide.md"),
  "utf8",
);

/**
 * Reaching the traversal cap costs more than a shorter run: it disables the sweep, which is
 * the only thing that retires a deleted page. The run still succeeds and still ingests, so
 * the corpus can sit with its sweep off for weeks and look healthy.
 *
 * Both halves are pinned here — that the consequence is announced, and that the caps are
 * really tunable, because the admin guide has always described them as configurable.
 */
void describe("workspace traversal cap", () => {
  void it("is configurable, as the admin guide says it is", () => {
    assert.match(source, /NOTION_LINKED_PAGE_MAX_PAGES/);
    assert.match(source, /NOTION_LINKED_PAGE_MAX_DEPTH/);
    // Literals would make the guide's "system config" wording false again.
    assert.doesNotMatch(source, /const LINKED_PAGE_MAX_PAGES = \d+;/);
    assert.doesNotMatch(source, /const LINKED_PAGE_MAX_DEPTH = \d+;/);
  });

  void it("refuses a malformed override rather than trusting it", () => {
    // A cap of 0 or NaN would reduce the workspace to nothing, quietly.
    const guard = source.slice(source.indexOf("function positiveIntFromEnv"));
    assert.match(guard.slice(0, 400), /Number\.isFinite\(parsed\) && parsed > 0/);
  });

  void it("warns when the cap truncates the traversal", () => {
    const discovery = source.slice(source.indexOf("const hitCap ="));
    assert.match(discovery.slice(0, 900), /level: "warn"/);
    // The message must name the consequence, not just the fact.
    assert.match(discovery.slice(0, 900), /will NOT be/i);
    assert.match(discovery.slice(0, 900), /NOTION_LINKED_PAGE_MAX_PAGES/);
  });

  void it("warns when the sweep is skipped for an incomplete traversal", () => {
    // "full run, no errors" must not read as "the corpus is now exactly the workspace".
    assert.match(
      source,
      /Missing-document sweep skipped: the workspace traversal did not complete/,
    );
  });

  void it("keeps the admin guide honest about what the caps do", () => {
    assert.match(
      adminGuide,
      /NOTION_LINKED_PAGE_MAX_PAGES/,
      "the guide must name the variable an operator would change",
    );
  });
});
