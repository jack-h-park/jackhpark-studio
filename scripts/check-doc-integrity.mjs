import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const entrypointDocs = [
  "readme.md",
  "contributing.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/README.md",
  "docs/00-start-here/repository-map.md",
  "docs/00-start-here/documentation-governance.md",
];

const forbiddenPatterns = [
  {
    pattern: /Updated 2025/i,
    reason: "time-stamped stale framing",
  },
  {
    pattern: /\.\/docs\/telemetry-logging\.md/,
    reason: "legacy broken README link",
  },
  {
    pattern: /Next\.js App Router/,
    reason: "outdated router framing for this repo",
  },
  {
    pattern: /React 18 functional components/,
    reason: "outdated React version framing for this repo",
  },
];

const requiredReadmeReferences = [
  "./docs/README.md",
  "./docs/00-start-here/repository-map.md",
  "./.env.example",
];

const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

const errors = [];

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function isLocalRelativeLink(link) {
  return link.startsWith("./") || link.startsWith("../");
}

function normalizeLinkTarget(link) {
  return link.replace(/^<|>$/g, "").split("#")[0];
}

for (const relativePath of entrypointDocs) {
  const absolutePath = path.join(repoRoot, relativePath);

  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath} is missing`);
    continue;
  }

  const content = read(relativePath);

  for (const { pattern, reason } of forbiddenPatterns) {
    if (pattern.test(content)) {
      errors.push(`${relativePath} contains forbidden pattern (${reason})`);
    }
  }

  for (const match of content.matchAll(markdownLinkPattern)) {
    const rawLink = match[1]?.trim();
    if (!rawLink || !isLocalRelativeLink(rawLink)) {
      continue;
    }

    const normalized = normalizeLinkTarget(rawLink);
    if (!normalized) {
      continue;
    }

    const resolved = path.resolve(path.dirname(absolutePath), normalized);
    if (!existsSync(resolved)) {
      errors.push(`${relativePath} has broken local link: ${rawLink}`);
    }
  }
}

const readmeContent = read("readme.md");
for (const requiredReference of requiredReadmeReferences) {
  if (!readmeContent.includes(requiredReference)) {
    errors.push(`readme.md is missing required reference: ${requiredReference}`);
  }
}

if (errors.length > 0) {
  console.error("Documentation integrity check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Documentation integrity check passed.");
