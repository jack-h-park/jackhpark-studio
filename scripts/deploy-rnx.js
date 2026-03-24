// scripts/deploy-rnx.js
//
// Usage: node scripts/deploy-rnx.js <tag>
//   e.g. node scripts/deploy-rnx.js 7.7.1-jp.4
//
// What it does:
//   1. Creates and pushes a git tag on react-notion-x
//   2. Switches nextjs-react-notion-x deps to remote (the new tag)
//   3. Runs pnpm install to regenerate pnpm-lock.yaml
//   4. Commits and pushes the changes → triggers Vercel deployment

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEXTJS_ROOT = path.resolve(__dirname, "..");
const RNX_ROOT = path.resolve(NEXTJS_ROOT, "../react-notion-x");

function run(cmd, cwd = NEXTJS_ROOT) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function main() {
  const tag = process.argv[2];

  if (!tag) {
    throw new Error(
      'Usage: node scripts/deploy-rnx.js <tag>  (e.g. "7.7.1-jp.4")',
    );
  }

  // ── Step 1: Tag and push react-notion-x ──────────────────────────────────
  console.log(`\n[1/4] Tagging react-notion-x @ ${tag}`);

  const existingTags = execSync("git tag", { cwd: RNX_ROOT })
    .toString()
    .trim()
    .split("\n");

  if (existingTags.includes(tag)) {
    throw new Error(
      `Tag "${tag}" already exists on react-notion-x. Use a new tag.`,
    );
  }

  run(`git tag ${tag}`, RNX_ROOT);
  run(`git push origin ${tag}`, RNX_ROOT);

  // ── Step 2: Switch to remote deps ────────────────────────────────────────
  console.log(`\n[2/4] Switching nextjs-react-notion-x deps to remote @ ${tag}`);
  run(`node scripts/switch-rnx-deps.js remote ${tag}`);

  // ── Step 3: Regenerate pnpm-lock.yaml ────────────────────────────────────
  console.log("\n[3/4] Regenerating pnpm-lock.yaml");
  run("pnpm install");

  // ── Step 4: Commit and push → triggers Vercel ────────────────────────────
  console.log("\n[4/4] Committing and pushing to main");
  run("git add package.json pnpm-lock.yaml");
  run(`git commit -m "chore: deploy react-notion-x ${tag}"`);
  run("git push origin main");

  console.log(`\n✅ Done. Vercel will pick up the push and deploy automatically.`);
  console.log(
    "\n⚠️  Remember to switch back to local deps when resuming development:",
  );
  console.log("   pnpm run deps:use-local && pnpm install");
}

main();
