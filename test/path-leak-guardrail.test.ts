import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findEscapingLinks,
  findMachineLocalPaths,
} from "../scripts/check-path-leaks.mjs";

void describe("path-leak guardrail", () => {
  void it("flags a relative link that resolves outside the repository", () => {
    // The real case: a note in docs/ linking a sibling repo through the
    // workspace root. It resolves on one machine and nowhere else.
    const findings = findEscapingLinks(
      "docs/brand-guidelines.md",
      "see [guide](../../../../ai-assets/some-repo/docs/guide.md)",
    );

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.rule, "escaping-link");
  });

  void it("allows a relative link that stays inside the repository", () => {
    // Skills legitimately reach the repo root through three levels.
    assert.deepEqual(
      findEscapingLinks(
        ".claude/skills/example/SKILL.md",
        "see [doc](../../../docs/ui/depth-system.md)",
      ),
      [],
    );
  });

  void it("ignores URLs, anchors and site-absolute paths", () => {
    const content = [
      "[a](https://example.com/../../x)",
      "[b](#section)",
      "[c](/assets/thing.png)",
      "[d](mailto:someone@example.com)",
    ].join("\n");

    assert.deepEqual(findEscapingLinks("docs/x.md", content), []);
  });

  void it("flags home directories and the workspace convention", () => {
    const macos = findMachineLocalPaths(
      "scratch/x.js",
      'const p = "/Users/someone/notes/x";',
    );
    const linux = findMachineLocalPaths(
      "scratch/x.js",
      'const p = "/home/someone/notes/x";',
    );
    const workspace = findMachineLocalPaths(
      "docs/x.md",
      "run it from ~/workspace/common/thing",
    );

    assert.equal(macos.length, 1);
    assert.equal(linux.length, 1);
    assert.equal(workspace.length, 1);
    assert.equal(macos[0]?.rule, "machine-local-path");
  });

  void it("leaves ordinary repo-relative paths alone", () => {
    assert.deepEqual(
      findMachineLocalPaths(
        "docs/x.md",
        "see styles/notion-parity.css and ./scripts/build.sh",
      ),
      [],
    );
  });
});
