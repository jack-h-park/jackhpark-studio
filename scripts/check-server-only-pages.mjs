import fs from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const roots = ["pages", "lib/server/api"];
const allowedExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
]);

const checks = [
  {
    pattern: /server-only/,
    description: '"server-only" import',
  },
  {
    pattern: /langfuse\.next-server/,
    description: '"@/lib/langfuse.next-server" import',
  },
];

async function collectFiles(dir) {
  const result = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectFiles(entryPath)));
      continue;
    }
    if (allowedExtensions.has(path.extname(entry.name))) {
      result.push(entryPath);
    }
  }
  return result;
}

async function runCheck() {
  const violations = [];
  for (const root of roots) {
    const absoluteRoot = path.join(workspaceRoot, root);
    try {
      const files = await collectFiles(absoluteRoot);
      for (const file of files) {
        const source = await fs.readFile(file, "utf8");
        for (const { pattern, description } of checks) {
          if (pattern.test(source)) {
            violations.push(`${path.relative(workspaceRoot, file)} contains ${description}`);
          }
        }
      }
    } catch (err) {
      if (err?.code === "ENOENT") {
        continue;
      }
      throw err;
    }
  }

  if (violations.length > 0) {
    const lines = ["server-only import check failed:"];
    for (const violation of violations) {
      lines.push(`  • ${violation}`);
    }
    throw new Error(lines.join("\n"));
  }

  console.log("server-only import check passed");
}

try {
  await runCheck();
} catch (err) {
  console.error("server-only import check error", err);
  throw err;
}
