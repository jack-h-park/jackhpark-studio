import { execFileSync } from "node:child_process";

// Vercel's ignored build step uses 0 to skip and any nonzero exit to build.
// Keep this dependency-free: it runs before package installation.
if (process.env.VERCEL_ENV === "preview") process.exit(0);

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
      (file.startsWith("docs/") && file.endsWith(".md")),
  );
}

let skip = false;
try {
  skip = canSkipProductionBuild();
} catch {
  // Uncertainty must never suppress a real production release.
}
process.exit(skip ? 0 : 1);
