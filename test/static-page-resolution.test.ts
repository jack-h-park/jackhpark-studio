import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyStaticPages } from "../scripts/smoke/static-page-scope.mjs";

const page =
  "export default function Privacy() { return <main>Privacy</main>; }";
type Snapshot = Record<string, string>;

function verify(before: Snapshot, after: Snapshot) {
  const snapshots: Record<string, Snapshot> = { before, after };
  const git = (...args: string[]) => {
    if (args[0] === "ls-tree" && args[1] === "-r")
      return Object.keys(snapshots[args[3]]).join("\n");
    if (args[0] === "ls-tree") {
      const file = args[3];
      return Object.hasOwn(snapshots[args[1]], file)
        ? `100644 blob ${"0".repeat(40)}\t${file}`
        : "";
    }
    if (args[0] === "show") {
      const [revision, ...file] = args[1].split(":");
      assert.ok(Object.hasOwn(snapshots[revision], file.join(":")));
      return snapshots[revision][file.join(":")];
    }
    throw new Error(`Unexpected fixture command: ${args[0]}`);
  };
  return verifyStaticPages(git, "before", "after", ["pages/privacy.tsx"]);
}

void describe("static page reverse dependency resolution", () => {
  for (const target of ["privacy", "privacy.module.css"]) {
    for (const specifier of [
      `@/pages/./${target}`,
      `@/pages/unused/../${target}`,
      `pages/./${target}`,
      `pages/unused/../${target}`,
      `./unused/../${target}`,
    ]) {
      for (const revision of ["before", "after"] as const) {
        void it(`retains full coverage for ${revision} consumer of ${specifier}`, () => {
          const base = {
            "pages/privacy.tsx": page,
            "pages/privacy.module.css": ".page { color: red; }",
          };
          const before: Snapshot = { ...base };
          const after: Snapshot = {
            ...base,
            "pages/privacy.tsx": page.replace("Privacy</", "Updated</"),
          };
          const consumer = `import Shared from "${specifier}"; export default Shared;`;
          (revision === "before" ? before : after)["pages/other.tsx"] =
            consumer;
          assert.equal(verify(before, after), null);
        });
      }
    }
  }

  for (const extension of [
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "mts",
    "cts",
  ]) {
    for (const revision of ["before", "after"] as const) {
      void it(`follows ${revision} directory index.${extension} into an excluded directory`, () => {
        const before: Snapshot = {
          "pages/privacy.tsx": page,
          "pages/other.tsx":
            'import Shared from "../components/Consumer"; export default Shared;',
          "components/Consumer.tsx":
            "export default function Consumer() { return null; }",
        };
        const after: Snapshot = {
          ...before,
          "pages/privacy.tsx": page.replace("Privacy</", "Updated</"),
        };
        const selected = revision === "before" ? before : after;
        selected["components/Consumer.tsx"] =
          'import Shared from "../scripts/shared"; export default Shared;';
        selected[`scripts/shared/index.${extension}`] =
          'export {default} from "../../pages/privacy";';
        assert.equal(verify(before, after), null);
      });
    }
  }

  void it("preserves reduction for a genuinely isolated page alongside an unrelated directory import", () => {
    const before = {
      "pages/privacy.tsx": page,
      "components/Other.tsx": 'export {default} from "../scripts/shared";',
      "scripts/shared/index.mjs": 'export default "unrelated";',
    };
    assert.deepEqual(
      verify(before, {
        ...before,
        "pages/privacy.tsx": page.replace("Privacy</", "Updated</"),
      }),
      ["/privacy"],
    );
  });

  void it("follows a directory import with a trailing slash", () => {
    const before = {
      "pages/privacy.tsx": page,
      "pages/other.tsx": 'export {default} from "../scripts/shared/";',
      "scripts/shared/index.mjs":
        'export {default} from "../../pages/privacy";',
    };
    assert.equal(
      verify(before, {
        ...before,
        "pages/privacy.tsx": page.replace("Privacy</", "Updated</"),
      }),
      null,
    );
  });

  void it("retains full coverage for an unsupported local package entry instead of dropping its edge", () => {
    const before = {
      "pages/privacy.tsx": page,
      "pages/other.tsx": 'export {default} from "../scripts/shared";',
      "scripts/shared/package.json": '{"main":"bridge.mjs"}',
      "scripts/shared/bridge.mjs":
        'export {default} from "../../pages/privacy";',
    };
    assert.throws(
      () =>
        verify(before, {
          ...before,
          "pages/privacy.tsx": page.replace("Privacy</", "Updated</"),
        }),
      /unsupported local package entry/,
    );
  });

  void it("rejects package-entry ambiguity even when an unused index file exists", () => {
    const before = {
      "pages/privacy.tsx": page,
      "pages/other.tsx": 'export {default} from "../scripts/shared";',
      "scripts/shared/package.json": '{"main":"bridge.mjs"}',
      "scripts/shared/index.js": 'export default "unrelated";',
      "scripts/shared/bridge.mjs":
        'export {default} from "../../pages/privacy";',
    };
    assert.throws(
      () =>
        verify(before, {
          ...before,
          "pages/privacy.tsx": page.replace("Privacy</", "Updated</"),
        }),
      /unsupported local package entry/,
    );
  });
});
