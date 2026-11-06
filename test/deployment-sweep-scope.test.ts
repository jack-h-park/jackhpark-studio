import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  classifyChanges,
  resolveSweepPlan,
} from "../scripts/smoke/deployment-sweep-scope.mjs";

function repository() {
  const cwd = mkdtempSync(path.join(tmpdir(), "sweep-history-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  const commit = (file: string, body = "fixture") => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), body);
    git("add", "--all");
    git("commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  const baseline = commit("public/decks/example/index.html");
  return {
    cwd,
    git,
    commit,
    baseline,
    clean: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

void describe("deployment scope Git boundary", () => {
  void it("reduces a regular deck-only change and includes its URL", () => {
    const r = repository();
    try {
      const current = r.commit("public/decks/example/index.html", "updated");
      const result = classifyChanges(r.cwd, r.baseline, current);
      assert.equal(result.scope, "representative");
      assert.ok(result.paths.includes("/decks/example/index.html"));
      assert.ok(result.paths.includes("/aws"));
    } finally {
      r.clean();
    }
  });

  void it("includes an earlier undeployed runtime commit instead of comparing HEAD^", () => {
    const r = repository();
    try {
      r.commit("lib/notion.ts", "runtime change");
      const current = r.commit("public/decks/example/index.html", "updated");
      assert.equal(classifyChanges(r.cwd, r.baseline, current).scope, "full");
    } finally {
      r.clean();
    }
  });

  void it("keeps full coverage for deletion, rename, same-commit redeploy, rollback and missing history", () => {
    const r = repository();
    try {
      assert.equal(
        classifyChanges(r.cwd, r.baseline, r.baseline).scope,
        "full",
      );
      r.git(
        "mv",
        "public/decks/example/index.html",
        "public/decks/example/other.html",
      );
      r.git("commit", "-qm", "rename");
      const current = r.git("rev-parse", "HEAD");
      assert.equal(classifyChanges(r.cwd, r.baseline, current).scope, "full");
      assert.equal(classifyChanges(r.cwd, current, r.baseline).scope, "full");
      assert.equal(
        classifyChanges(r.cwd, "a".repeat(40), current).scope,
        "full",
      );
    } finally {
      r.clean();
    }
  });

  void it("does not exempt a deck symlink", () => {
    const r = repository();
    try {
      r.git("rm", "public/decks/example/index.html");
      mkdirSync(path.join(r.cwd, "public/decks/example"), { recursive: true });
      symlinkSync(
        "../../../lib/notion.ts",
        path.join(r.cwd, "public/decks/example/index.html"),
      );
      r.git("add", "--all");
      r.git("commit", "-qm", "symlink");
      assert.equal(
        classifyChanges(r.cwd, r.baseline, r.git("rev-parse", "HEAD")).scope,
        "full",
      );
    } finally {
      r.clean();
    }
  });
});

function apiFixture(baseline: string, current: string) {
  const currentCreated = "2026-11-06T12:00:00Z";
  const previousCreated = "2026-11-05T12:00:00Z";
  const data: Record<string, unknown> = {
    "/deployments?environment=Production&per_page=20": [
      {
        id: 20,
        sha: current,
        environment: "Production",
        created_at: currentCreated,
      },
      {
        id: 19,
        sha: baseline,
        environment: "Production",
        created_at: previousCreated,
      },
    ],
    "/deployments/19/statuses?per_page=100": [
      { state: "inactive", created_at: currentCreated },
      { state: "success", created_at: "2026-11-05T12:05:00Z" },
    ],
    [`/actions/workflows/sitemap-availability.yml/runs?event=deployment_status&per_page=20`]:
      {
        workflow_runs: [
          {
            id: 90,
            head_sha: baseline,
            conclusion: "success",
            event: "deployment_status",
            created_at: "2026-11-05T12:06:00Z",
            updated_at: "2026-11-05T12:07:00Z",
          },
        ],
      },
    "/actions/runs/90/jobs?per_page=100": {
      jobs: [{ name: "Sitemap sweep", conclusion: "success" }],
    },
  };
  return {
    data,
    event: {
      deployment: {
        id: 20,
        sha: current,
        environment: "Production",
        created_at: currentCreated,
      },
      deployment_status: {
        state: "success",
        environment: "Production",
        created_at: "2026-11-06T12:05:00Z",
      },
      repository: { full_name: "example/studio", default_branch: "main" },
    },
  };
}

void describe("verified production baseline", () => {
  void it("does not reduce a late event when a newer same-SHA deployment exists", async () => {
    const r = repository();
    try {
      const current = r.commit("public/decks/example/index.html", "updated");
      r.git("update-ref", "refs/remotes/origin/main", current);
      const f = apiFixture(r.baseline, current);
      const deployments = f.data[
        "/deployments?environment=Production&per_page=20"
      ] as Record<string, unknown>[];
      deployments.unshift({
        id: 21,
        sha: current,
        environment: "Production",
        created_at: "2026-11-06T12:01:00Z",
      });
      const plan = await resolveSweepPlan({
        cwd: r.cwd,
        eventName: "deployment_status",
        event: f.event,
        requestJson: async (suffix: string) => f.data[suffix],
      });
      assert.equal(plan.scope, "full");
    } finally {
      r.clean();
    }
  });

  void it("retains full coverage when the newest verification belongs to another SHA", async () => {
    const r = repository();
    try {
      const current = r.commit("public/decks/example/index.html", "updated");
      r.git("update-ref", "refs/remotes/origin/main", current);
      const f = apiFixture(r.baseline, current);
      const key = `/actions/workflows/sitemap-availability.yml/runs?event=deployment_status&per_page=20`;
      const original = f.data[key] as {
        workflow_runs: Record<string, unknown>[];
      };
      const newer = {
        ...original.workflow_runs[0],
        id: 91,
        head_sha: "c".repeat(40),
        created_at: "2026-11-05T13:00:00Z",
        updated_at: "2026-11-05T13:01:00Z",
      };
      const requestJson = async (suffix: string) => {
        if (suffix.includes("/runs?") && !suffix.includes("head_sha="))
          return { workflow_runs: [newer, ...original.workflow_runs] };
        return f.data[suffix];
      };
      assert.equal(
        (
          await resolveSweepPlan({
            cwd: r.cwd,
            eventName: "deployment_status",
            event: f.event,
            requestJson,
          })
        ).scope,
        "full",
      );
    } finally {
      r.clean();
    }
  });

  void it("does not hide a newer failed verification behind an earlier success", async () => {
    const r = repository();
    try {
      const current = r.commit("public/decks/example/index.html", "updated");
      r.git("update-ref", "refs/remotes/origin/main", current);
      const f = apiFixture(r.baseline, current);
      const runsKey = `/actions/workflows/sitemap-availability.yml/runs?event=deployment_status&per_page=20`;
      const original = f.data[runsKey] as {
        workflow_runs: Record<string, unknown>[];
      };
      const failed = {
        ...original.workflow_runs[0],
        id: 91,
        conclusion: "failure",
        created_at: "2026-11-05T12:08:00Z",
        updated_at: "2026-11-05T12:09:00Z",
      };
      const requestJson = async (suffix: string) => {
        if (suffix.includes("/runs?") && !suffix.includes("status=success"))
          return { workflow_runs: [failed, ...original.workflow_runs] };
        if (suffix.includes("status=success")) return original;
        return f.data[suffix];
      };
      const plan = await resolveSweepPlan({
        cwd: r.cwd,
        eventName: "deployment_status",
        event: f.event,
        requestJson,
      });
      assert.equal(plan.scope, "full");
    } finally {
      r.clean();
    }
  });

  void it("keeps full coverage when deployment creation and activation order disagree", async () => {
    const r = repository();
    try {
      const current = r.commit("public/decks/example/index.html", "updated");
      r.git("update-ref", "refs/remotes/origin/main", current);
      const f = apiFixture(r.baseline, current);
      const deployments = f.data[
        "/deployments?environment=Production&per_page=20"
      ] as Record<string, unknown>[];
      deployments.push({
        id: 18,
        sha: "b".repeat(40),
        environment: "Production",
        created_at: "2026-11-04T12:00:00Z",
      });
      f.data["/deployments/18/statuses?per_page=100"] = [
        { state: "success", created_at: "2026-11-05T13:00:00Z" },
      ];
      const plan = await resolveSweepPlan({
        cwd: r.cwd,
        eventName: "deployment_status",
        event: f.event,
        requestJson: async (suffix: string) => f.data[suffix],
      });
      assert.equal(plan.scope, "full");
    } finally {
      r.clean();
    }
  });

  void it("requires successful Production history and an actually executed successful sweep", async () => {
    const r = repository();
    try {
      const current = r.commit("public/decks/example/index.html", "updated");
      r.git("update-ref", "refs/remotes/origin/main", current);
      const f = apiFixture(r.baseline, current);
      const requestJson = async (suffix: string) => {
        assert.ok(
          Object.hasOwn(f.data, suffix),
          `unexpected API call: ${suffix}`,
        );
        return f.data[suffix];
      };
      const options = {
        cwd: r.cwd,
        eventName: "deployment_status",
        event: f.event,
        requestJson,
      };
      assert.equal((await resolveSweepPlan(options)).scope, "representative");
      f.data["/actions/runs/90/jobs?per_page=100"] = {
        jobs: [{ name: "Sitemap sweep", conclusion: "skipped" }],
      };
      assert.equal((await resolveSweepPlan(options)).scope, "full");
      f.data["/actions/runs/90/jobs?per_page=100"] = {
        jobs: [{ name: "Sitemap sweep", conclusion: "failure" }],
      };
      assert.equal((await resolveSweepPlan(options)).scope, "full");
      assert.equal(
        (
          await resolveSweepPlan({
            ...options,
            requestJson: async () => {
              throw new Error("unavailable");
            },
          })
        ).scope,
        "full",
      );
      assert.equal(
        (await resolveSweepPlan({ ...options, eventName: "workflow_dispatch" }))
          .scope,
        "full",
      );
      r.git("update-ref", "refs/remotes/origin/main", r.baseline);
      assert.equal(
        (await resolveSweepPlan(options)).scope,
        "full",
        "stale event must not reduce checks",
      );
    } finally {
      r.clean();
    }
  });
});
