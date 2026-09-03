#!/usr/bin/env node
/**
 * setup-hooks.js
 *
 * Installs project git hooks from scripts/hooks/ into .git/hooks/.
 * Run once after cloning: pnpm run setup-hooks
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_SRC = path.join(__dirname, "hooks");

// Ask git where the hooks live rather than assuming "<root>/.git/hooks". In a
// worktree, .git is a file pointing elsewhere, so the naive path does not exist
// and this script used to abort with "are you in the project root?".
// --git-common-dir resolves to the shared git dir that both checkouts use.
function resolveHooksDest() {
  const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: __dirname,
    encoding: "utf8",
  }).trim();

  // git reports the path relative to the cwd it was given, so resolve against
  // that same cwd. path.resolve leaves an already-absolute path alone.
  return path.join(path.resolve(__dirname, commonDir), "hooks");
}

let HOOKS_DEST;
try {
  HOOKS_DEST = resolveHooksDest();
} catch {
  console.error("✗ not a git repository — run this from inside the project");
  process.exit(1);
}

fs.mkdirSync(HOOKS_DEST, { recursive: true });

const hooks = fs.readdirSync(HOOKS_SRC);
for (const hook of hooks) {
  const src = path.join(HOOKS_SRC, hook);
  const dest = path.join(HOOKS_DEST, hook);
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`✓ Installed ${hook} → .git/hooks/${hook}`);
}

console.log("\nGit hooks installed. They will run automatically on push.");
