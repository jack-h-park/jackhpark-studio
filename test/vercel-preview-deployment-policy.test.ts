import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const config = JSON.parse(
  readFileSync(path.join(repoRoot, "vercel.json"), "utf8"),
) as {
  ignoreCommand: string;
};

function createRepository(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "deployment-policy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  const write = (name: string, content = "initial\n") => {
    const destination = path.join(directory, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  const commit = () => {
    git("add", "--all");
    git(
      "-c",
      "user.name=Policy Test",
      "-c",
      "user.email=policy@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet");
  write("pages/index.tsx");
  write("CLAUDE.md");
  write("docs/architecture/example.md");
  const script = path.join(repoRoot, "scripts/vercel-ignore-build.mjs");
  if (existsSync(script)) {
    mkdirSync(path.join(directory, "scripts"));
    copyFileSync(
      script,
      path.join(directory, "scripts/vercel-ignore-build.mjs"),
    );
  }
  const baseline = commit();
  const run = (
    previous = baseline,
    environment = "production",
    current = git("rev-parse", "HEAD"),
  ) => {
    const result = spawnSync("sh", ["-c", config.ignoreCommand], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        VERCEL_ENV: environment,
        VERCEL_GIT_PREVIOUS_SHA: previous,
        VERCEL_GIT_COMMIT_SHA: current,
      },
    });
    assert.equal(result.error, undefined);
    return result.status;
  };
  return { directory, git, write, commit, baseline, run };
}

void describe("Vercel deployment policy", () => {
  void it("skips Preview even without Git deployment metadata", (t) => {
    const fixture = createRepository(t);
    assert.equal(fixture.run("", "preview", ""), 0);
  });

  void it("skips verified documentation-only Production changes", (t) => {
    const fixture = createRepository(t);
    fixture.write("CLAUDE.md", "updated instructions\n");
    fixture.write("AGENTS.md");
    fixture.write("README.md");
    fixture.write("docs/architecture/example.md", "updated design\n");
    fixture.commit();
    assert.equal(fixture.run(), 0);
  });

  for (const file of [
    "pages/index.tsx",
    "public/guide.html",
    "package.json",
    "pnpm-lock.yaml",
    "vercel.json",
    "next.config.js",
    "unknown.md",
    "docs/runtime.json",
    "scripts/build.mjs",
    ".github/workflows/ci.yml",
  ]) {
    void it(`builds when ${file} changes`, (t) => {
      const fixture = createRepository(t);
      fixture.write(file, "changed\n");
      fixture.commit();
      assert.equal(fixture.run(), 1);
    });
  }

  void it("builds mixed documentation and runtime changes", (t) => {
    const fixture = createRepository(t);
    fixture.write("CLAUDE.md", "changed\n");
    fixture.write("pages/index.tsx", "changed\n");
    fixture.commit();
    assert.equal(fixture.run(), 1);
  });

  void it("compares cumulative changes rather than only the last commit", (t) => {
    const fixture = createRepository(t);
    fixture.write("pages/index.tsx", "unreleased runtime change\n");
    fixture.commit();
    fixture.write("CLAUDE.md", "later documentation change\n");
    fixture.commit();
    assert.equal(fixture.run(), 1);
  });

  void it("skips multiple documentation commits since the last successful deploy", (t) => {
    const fixture = createRepository(t);
    fixture.write("CLAUDE.md", "changed\n");
    fixture.commit();
    fixture.write("docs/architecture/example.md", "changed\n");
    fixture.commit();
    assert.equal(fixture.run(), 0);
  });

  void it("builds when a runtime file is renamed into the documentation allowlist", (t) => {
    const fixture = createRepository(t);
    fixture.git("mv", "pages/index.tsx", "docs/architecture/moved.md");
    fixture.commit();
    assert.equal(fixture.run(), 1);
  });

  void it("skips a documentation deletion", (t) => {
    const fixture = createRepository(t);
    fixture.git("rm", "docs/architecture/example.md");
    fixture.commit();
    assert.equal(fixture.run(), 0);
  });

  void it("builds a same-commit redeploy for environment or dashboard changes", (t) => {
    const fixture = createRepository(t);
    assert.equal(fixture.run(), 1);
  });

  for (const previous of ["", "not-a-sha", "f".repeat(40)]) {
    void it(`builds with unavailable previous-deployment metadata (${previous || "missing"})`, (t) => {
      const fixture = createRepository(t);
      fixture.write("CLAUDE.md", "changed\n");
      fixture.commit();
      assert.equal(fixture.run(previous), 1);
    });
  }

  void it("builds when the current deployment SHA does not match the checkout", (t) => {
    const fixture = createRepository(t);
    fixture.write("CLAUDE.md", "changed\n");
    fixture.commit();
    assert.equal(
      fixture.run(fixture.baseline, "production", fixture.baseline),
      1,
    );
    assert.equal(fixture.run(fixture.baseline, "production", ""), 1);
  });

  void it("builds when the previous deployment is not an ancestor", (t) => {
    const fixture = createRepository(t);
    fixture.write("README.md");
    const otherBranch = fixture.commit();
    fixture.git("checkout", "--detach", fixture.baseline);
    fixture.write("CLAUDE.md", "different branch\n");
    fixture.commit();
    assert.equal(fixture.run(otherBranch), 1);
  });

  void it("builds when Git cannot inspect the checkout", (t) => {
    const fixture = createRepository(t);
    fixture.write("CLAUDE.md", "changed\n");
    const current = fixture.commit();
    renameSync(
      path.join(fixture.directory, ".git"),
      path.join(fixture.directory, "git-backup"),
    );
    assert.equal(fixture.run(fixture.baseline, "production", current), 1);
  });

  void it("builds custom environments instead of applying the Production skip rule", (t) => {
    const fixture = createRepository(t);
    fixture.write("CLAUDE.md", "changed\n");
    fixture.commit();
    assert.equal(fixture.run(fixture.baseline, "staging"), 1);
  });
});
