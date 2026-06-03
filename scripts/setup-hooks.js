#!/usr/bin/env node
/**
 * setup-hooks.js
 *
 * Installs project git hooks from scripts/hooks/ into .git/hooks/.
 * Run once after cloning: pnpm run setup-hooks
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_SRC = path.join(__dirname, "hooks");
const HOOKS_DEST = path.join(__dirname, "..", ".git", "hooks");

if (!fs.existsSync(HOOKS_DEST)) {
  console.error("✗ .git/hooks not found — are you in the project root?");
  process.exit(1);
}

const hooks = fs.readdirSync(HOOKS_SRC);
for (const hook of hooks) {
  const src = path.join(HOOKS_SRC, hook);
  const dest = path.join(HOOKS_DEST, hook);
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`✓ Installed ${hook} → .git/hooks/${hook}`);
}

console.log("\nGit hooks installed. They will run automatically on push.");
