import { execFileSync } from "node:child_process";

// Vercel's ignored build step uses 0 to skip and any nonzero exit to build.
// Keep this dependency-free: it runs before package installation.
if (process.env.VERCEL_ENV === "preview") process.exit(0);

// These existing local experiments do not ship as application runtime code.
// CI still validates them, including TypeScript's repository-wide checks.
// Keep exact paths: new helpers and unrelated scripts/tests must still build.
const localToolingFiles = new Set([
  ...[
    "README.md",
    "fixture.mjs",
    "host-memory.mjs",
    "judge.ts",
    "lmstudio-admin.mjs",
    "manifest.json",
    "preload-hold.mjs",
    "private-path.mjs",
    "record-fixture.ts",
    "recorder.mjs",
    "report.ts",
    "results-store.mjs",
    "run-bakeoff.mjs",
    "sample-questions.json",
    "score.ts",
    "stream-metrics.mjs",
    "summarize.ts",
  ].map((file) => `scripts/local-llm-bakeoff/${file}`),
  ...[
    "judge",
    "lmstudio-admin",
    "recording",
    "restore-config",
    "runner",
    "store-memory",
    "stream-metrics",
    "summarize",
  ].map((name) => `test/local-llm-bakeoff-${name}.test.ts`),
]);

function canSkipProductionBuild() {
  if (process.env.VERCEL_ENV !== "production") return false;

  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA ?? "";
  const current = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  const commitSha = /^[\da-f]{40}$/i;
  if (!commitSha.test(previous) || !commitSha.test(current)) return false;

  const git = (...args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
    });

  // Never use HEAD^: an earlier code change may still be waiting to deploy.
  // Missing shallow-clone history, a rollback, or mismatched metadata builds.
  if (git("rev-parse", "HEAD").trim() !== current) return false;
  git("merge-base", "--is-ancestor", previous, current);
  const changed = git(
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    previous,
    current,
    "--",
  )
    .split("\0")
    .filter(Boolean);

  // A same-commit redeploy can carry new environment/dashboard settings.
  if (changed.length === 0) return false;
  return changed.every(
    (file) =>
      ["README.md", "CLAUDE.md", "AGENTS.md"].includes(file) ||
      (file.startsWith("docs/") && file.endsWith(".md")) ||
      localToolingFiles.has(file),
  );
}

let skip = false;
try {
  skip = canSkipProductionBuild();
} catch {
  // Uncertainty must never suppress a real production release.
}
process.exit(skip ? 0 : 1);
