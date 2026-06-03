#!/usr/bin/env node
/**
 * release-fork.js
 *
 * Automates the full react-notion-x fork release workflow:
 *
 *   1. Reads the current version from the fork's root package.json
 *   2. Determines the next tag (auto-increments jp.N or uses the provided arg)
 *   3. Bumps the version in the fork
 *   4. Commits, tags, and pushes the fork
 *   5. Switches this repo to remote mode (switch-rnx-deps.js remote <tag>)
 *   6. Runs pnpm install to update pnpm-lock.yaml
 *   7. Prints the next steps (commit lockfile + push main repo)
 *
 * Usage:
 *   pnpm deps:release            — auto-increments jp version
 *   pnpm deps:release 7.7.1-jp.5 — explicit tag
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FORK_PATH = path.resolve(ROOT, "../../forks/react-notion-x");
const FORK_GITHUB_REMOTE = "origin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, cwd = ROOT, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { cwd, stdio: opts.silent ? "pipe" : "inherit", encoding: "utf8" });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s)  { return `\x1b[36m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }
function dim(s)   { return `\x1b[2m${s}\x1b[0m`; }

// ─── Version helpers ──────────────────────────────────────────────────────────

/** Parses "7.7.1-jp.3" → { base: "7.7.1", n: 3 } */
function parseJpVersion(version) {
  const m = version.match(/^(.+)-jp\.(\d+)$/);
  if (!m) throw new Error(`Cannot parse jp version: ${version}`);
  return { base: m[1], n: parseInt(m[2], 10) };
}

function nextJpVersion(current) {
  const { base, n } = parseJpVersion(current);
  return `${base}-jp.${n + 1}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const explicitTag = process.argv[2];

  console.log();
  console.log(bold("━━━ react-notion-x fork release ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log();

  // 1. Validate fork path
  if (!fs.existsSync(FORK_PATH)) {
    console.error(red(`✗ Fork not found at ${FORK_PATH}`));
    console.error(red("  Clone the fork first: git clone git@github.com:jack-h-park/react-notion-x.git"));
    process.exit(1);
  }

  // 2. Read current fork version
  const forkPkgPath = path.join(FORK_PATH, "package.json");
  const forkPkg = readJson(forkPkgPath);
  const currentVersion = forkPkg.version;
  console.log(`  Current fork version : ${cyan(currentVersion)}`);

  // 3. Determine new tag
  let newTag;
  if (explicitTag) {
    newTag = explicitTag;
  } else {
    try {
      newTag = nextJpVersion(currentVersion);
    } catch {
      console.error(red(`✗ Cannot auto-increment version "${currentVersion}". Pass an explicit tag:`));
      console.error(red("  pnpm deps:release 7.7.1-jp.5"));
      process.exit(1);
    }
  }
  console.log(`  New tag              : ${bold(green(newTag))}`);
  console.log();

  // 4. Check fork for uncommitted changes
  const forkStatus = run("git status --porcelain", FORK_PATH, { silent: true }).trim();
  if (forkStatus) {
    console.error(red("✗ Fork has uncommitted changes. Commit or stash them first:"));
    console.error(dim(forkStatus));
    process.exit(1);
  }

  // 5. Bump version in fork
  console.log(bold("Step 1/5 — Bump version in fork"));
  forkPkg.version = newTag;
  writeJson(forkPkgPath, forkPkg);
  console.log(green(`  ✓ package.json version → ${newTag}`));
  console.log();

  // 6. Commit + tag in fork
  console.log(bold("Step 2/5 — Commit, tag, and push fork"));
  run(`git add package.json`, FORK_PATH);
  run(`git commit -m "chore: bump version to ${newTag}"`, FORK_PATH);

  // Delete existing remote tag if it exists (idempotent)
  try {
    run(`git push ${FORK_GITHUB_REMOTE} :refs/tags/${newTag}`, FORK_PATH, { silent: true });
    console.log(`  ↺ Deleted existing remote tag ${newTag}`);
  } catch { /* tag didn't exist, fine */ }

  // Delete local tag if exists
  try {
    run(`git tag -d ${newTag}`, FORK_PATH, { silent: true });
  } catch { /* fine */ }

  run(`git tag ${newTag}`, FORK_PATH);
  run(`git push ${FORK_GITHUB_REMOTE} HEAD ${newTag}`, FORK_PATH);
  console.log(green(`  ✓ Fork pushed with tag ${newTag}`));
  console.log();

  // 7. Switch main repo to remote mode
  console.log(bold("Step 3/5 — Switch main repo to remote mode"));
  run(`node scripts/switch-rnx-deps.js remote ${newTag}`, ROOT);
  console.log();

  // 8. Update lockfile
  console.log(bold("Step 4/5 — Update pnpm-lock.yaml"));
  run(`pnpm up react-notion-x`, ROOT);
  console.log();

  // 9. Verify installed version matches
  console.log(bold("Step 5/5 — Verify"));
  const installedPkgPath = path.join(ROOT, "node_modules/react-notion-x/package.json");
  const installedVersion = readJson(installedPkgPath).version;
  if (installedVersion !== newTag) {
    console.warn(`  ⚠ Installed version is "${installedVersion}", expected "${newTag}"`);
    console.warn("    The tag may have been re-resolved. Check pnpm-lock.yaml.");
  } else {
    console.log(green(`  ✓ Installed version: ${installedVersion}`));
  }
  console.log();

  // 10. Print next steps
  console.log(bold("━━━ Done! Next steps ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log();
  console.log("  Commit and push the main repo:");
  console.log();
  console.log(cyan(`  git add package.json pnpm-lock.yaml`));
  console.log(cyan(`  git commit -m "chore(deps): upgrade react-notion-x to ${newTag}"`));
  console.log(cyan(`  git push`));
  console.log();
}

main().catch((err) => {
  console.error(red(`\n✗ ${err.message}`));
  process.exit(1);
});
