import { config } from "@fisch0920/config/eslint";
import simpleImportSort from "eslint-plugin-simple-import-sort"; // <-- 1. Import the plugin.

export default [
  {
    // Static, self-contained deck bundles published under public/ (minified
    // runtime + design-system JS from Claude Design) are not source we lint.
    ignores: ["instrumentation.js", "public/decks/**"],
  },
  ...config,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      // <-- 2. Register the plugin.
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": "error", // <-- 3. Enable the import sort rule.
      "@typescript-eslint/no-unused-vars": "error", // <-- Also enable the no-unused-vars rule.

      // CLAUDE.md bans `any`, but the rule ships off in the shared config, so
      // the ban was convention only and ~180 uses accumulated. Warn rather than
      // error: this surfaces new ones in review without blocking on the
      // existing backlog. tsconfig `strict` already catches *implicit* any —
      // what this covers is the explicit escape hatch. Promote to "error" per
      // directory as each is cleaned up.
      "@typescript-eslint/no-explicit-any": "warn",

      // --- Rules that were previously turned off ---
      "react/prop-types": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/filename-case": "off",
      "unicorn/prefer-global-this": "off",
      "no-process-env": "off",
      "array-callback-return": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/media-has-caption": "off",
      "jsx-a11y/interactive-supports-focus": "off",
      "jsx-a11y/anchor-is-valid": "off",
      "@typescript-eslint/naming-convention": "off",
    },
  },
  {
    // Tests use `any` deliberately: partial recordMap fixtures, intentionally
    // invalid inputs fed to validators, and stubbed globals like Date.now.
    // Typing those fully would describe the fixture rather than the contract.
    // Colocated tests get the same exemption as test/ — the original glob
    // missed them, e.g. components/chat/rendering/parse/*.test.ts.
    files: [
      "test/**/*.ts",
      "test/**/*.tsx",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Ambient module declarations for third-party packages that ship no usable
    // types. `any` is the shim here: the alternative is inventing a shape for
    // someone else's runtime and being wrong about it.
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Cleared of `any` and held there. Add each path as it is cleaned, so the
    // repo-wide "warn" ratchets to "error" one directory at a time instead of
    // staying advisory forever.
    files: [
      "lib/notion.ts",
      "lib/error-message.ts",
      "lib/notion/getPageCollectionId.ts",
      "lib/resolve-notion-page.ts",
      "lib/get-social-image-url.ts",
      "lib/server/ollama-provider.ts",
      "components/NotionPage.tsx",
      "components/NotionPageRenderer.tsx",
      "pages/api/chat-config.ts",
      "pages/api/chat-runtime.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
