/**
 * Path-leak guardrail.
 *
 * This repository is public, so every tracked file is published. Two shapes of
 * path are wrong here and neither is caught by anything else:
 *
 *  1. A relative link that resolves outside the repository. It only works on
 *     the author's machine — for every other reader it is a broken link — and
 *     it publishes the surrounding directory layout, which is how a private
 *     companion repo's local path form ends up in a public file. See
 *     workspace-governance's docs/public-safe-aliases.md: naming a private repo
 *     by its real local path reveals the existence and shape of a private
 *     system regardless of whether any single fact inside it is sensitive.
 *
 *  2. A machine-local absolute path (a home directory, or the `~/workspace`
 *     convention). Same leak, and the value is useless to anyone else.
 *
 * Deliberately structural: it matches path *shapes*, never a list of private
 * names. A denylist committed to a public repo would publish the very list it
 * protects — which is why the PR-text check in sibling repos keeps its terms in
 * a repo secret instead (`pr-text-sensitive-check.yml`). That check covers PR
 * titles and descriptions; this one covers file contents.
 */

import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const projectRoot = process.cwd();

const scannedExtensions = new Set([
  ".md",
  ".mdx",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".yml",
  ".yaml",
  ".sh",
  ".txt",
  ".html",
]);

const linkExtensions = new Set([".md", ".mdx"]);

// Lockfiles are generated and can legitimately carry long path-like strings.
const skippedFiles = new Set(["pnpm-lock.yaml", "package-lock.json"]);

// The guardrail's own files have to quote the shapes they reject. Kept to
// exactly these three so the exemption cannot spread: anything else naming a
// machine-local path is the thing this check is for.
const selfDocumenting = new Set([
  "scripts/check-path-leaks.mjs",
  "test/path-leak-guardrail.test.ts",
  "docs/path-leak-guardrail.md",
]);

// `](target)` — Markdown links and images.
const markdownLinkRegex = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

// A home directory on either platform, or the workspace convention by name.
const machineLocalRegex =
  /(?:\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+|~\/workspace)\//;

function isExternalTarget(target) {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // http:, https:, mailto:, data:, …
    target.startsWith("//") ||
    target.startsWith("#") ||
    target.startsWith("/") || // site-absolute, resolved by the server
    target.startsWith("{") || // template expression
    target.startsWith("<")
  );
}

/**
 * Relative Markdown link targets that resolve outside the repository root.
 */
export function findEscapingLinks(relativePath, content) {
  const fileDir = path.dirname(path.resolve(projectRoot, relativePath));
  const findings = [];

  content.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(markdownLinkRegex)) {
      const target = match[1];
      if (isExternalTarget(target)) continue;

      const withoutAnchor = target.split("#")[0];
      if (!withoutAnchor) continue;

      const resolved = path.resolve(fileDir, withoutAnchor);
      const fromRoot = path.relative(projectRoot, resolved);
      if (fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`)) {
        findings.push({
          line: index + 1,
          rule: "escaping-link",
          excerpt: target,
        });
      }
    }
  });

  return findings;
}

/**
 * Absolute home-directory paths and the `~/workspace` convention.
 */
export function findMachineLocalPaths(relativePath, content) {
  const findings = [];

  content.split(/\r?\n/).forEach((line, index) => {
    const match = machineLocalRegex.exec(line);
    if (match) {
      findings.push({
        line: index + 1,
        rule: "machine-local-path",
        excerpt: match[0],
      });
    }
  });

  return findings;
}

async function gitList(args) {
  const { stdout } = await execFile("git", args, {
    cwd: projectRoot,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.split("\0").filter(Boolean);
}

/**
 * Tracked files, plus untracked ones git would accept. CI only ever sees
 * tracked files, but a local run should flag the file being written right now —
 * the leak this guardrail exists for sat uncommitted for ten days.
 */
async function candidateFiles() {
  const [tracked, untracked] = await Promise.all([
    gitList(["ls-files", "-z"]),
    gitList(["ls-files", "-z", "--others", "--exclude-standard"]),
  ]);
  return [...new Set([...tracked, ...untracked])].sort();
}

async function main() {
  const files = await candidateFiles();
  const findings = [];

  for (const file of files) {
    if (skippedFiles.has(path.basename(file))) continue;
    if (selfDocumenting.has(file)) continue;
    if (!scannedExtensions.has(path.extname(file))) continue;

    let content;
    try {
      content = await readFile(path.resolve(projectRoot, file), "utf8");
    } catch {
      continue; // unreadable or vanished between listing and reading
    }

    if (linkExtensions.has(path.extname(file))) {
      for (const f of findEscapingLinks(file, content)) {
        findings.push({ file, ...f });
      }
    }
    for (const f of findMachineLocalPaths(file, content)) {
      findings.push({ file, ...f });
    }
  }

  if (findings.length > 0) {
    for (const f of findings) {
      console.error(`${f.file}:${f.line} [${f.rule}] ${f.excerpt}`);
    }
    console.error("");
    console.error(
      "escaping-link: the target resolves outside this repository, so it is broken for every reader but you, and it publishes the local directory layout. Link by repo name and in-repo path, or by URL.",
    );
    console.error(
      "machine-local-path: a home directory or the workspace-root convention. Take it from an argument with an in-repo default instead.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("Path-leak guardrail passed.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
