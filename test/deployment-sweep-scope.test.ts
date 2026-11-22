import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  classifyChanges,
  representativePaths,
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
  // Static-page fixtures need the same local dependency as the real page.
  // A missing local module deliberately prevents an independence proof.
  mkdirSync(path.join(cwd, "lib"), { recursive: true });
  writeFileSync(
    path.join(cwd, "lib/config.ts"),
    'export const author = "Fixture";',
  );
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

const staticPage = `import Head from "next/head";
import * as config from "@/lib/config";
import styles from "./privacy.module.css";
const TITLE = "Privacy";
export default function Privacy() {
  return <main className={styles.page}><Head><title>{TITLE}</title></Head><p>{config.author}</p></main>;
}`;

function staticFixture() {
  const r = repository();
  r.commit("pages/privacy.module.css", ".page { color: red; }");
  const baseline = r.commit("pages/privacy.tsx", staticPage);
  return { ...r, baseline };
}

void describe("independent static pages", () => {
  void it("checks the actual new privacy route and its CSS without sweeping all Notion pages", () => {
    const r = repository();
    try {
      r.commit(
        "pages/privacy.module.css",
        readFileSync(
          new URL("../pages/privacy.module.css", import.meta.url),
          "utf8",
        ),
      );
      const current = r.commit(
        "pages/privacy.tsx",
        readFileSync(new URL("../pages/privacy.tsx", import.meta.url), "utf8"),
      );
      const plan = classifyChanges(r.cwd, r.baseline, current);
      assert.equal(plan.scope, "representative");
      assert.deepEqual(representativePaths(plan)?.slice(-1), ["/privacy"]);
    } finally {
      r.clean();
    }
  });

  for (const file of ["pages/privacy.tsx", "pages/privacy.module.css"]) {
    void it(`reduces an isolated change to ${file}`, () => {
      const r = staticFixture();
      try {
        const current = r.commit(
          file,
          file.endsWith(".tsx")
            ? staticPage.replace("Privacy", "Privacy policy")
            : ".page { color: blue; }",
        );
        assert.equal(
          classifyChanges(r.cwd, r.baseline, current).scope,
          "representative",
        );
      } finally {
        r.clean();
      }
    });
  }

  for (const unsafe of [
    staticPage +
      "\nexport const getStaticProps = async () => ({ props: {}, revalidate: 1 });",
    staticPage +
      "\nexport const getServerSideProps = async () => ({ props: {} });",
    staticPage.replace("function Privacy()", "async function Privacy()"),
    staticPage.replace("return <main", "fetch('/api/data'); return <main"),
    staticPage.replace("{config.author}", "{Date.now()}"),
    staticPage.replace("{config.author}", "{import('./runtime')}"),
    staticPage.replace(
      'import Head from "next/head";',
      'import Head from "@/components/Shared";',
    ),
    staticPage.replace(
      "<main className",
      "<main onClick={config.author} className",
    ),
    staticPage.replace("<main className", "<main {...config} className"),
    staticPage.replace("function Privacy()", "function Privacy(props)"),
  ]) {
    void it(`keeps full coverage for unsafe page syntax ${unsafe.slice(-65)}`, () => {
      const r = staticFixture();
      try {
        const current = r.commit("pages/privacy.tsx", unsafe);
        assert.equal(classifyChanges(r.cwd, r.baseline, current).scope, "full");
      } finally {
        r.clean();
      }
    });
  }

  void it("validates the old page as well as the new one", () => {
    const r = staticFixture();
    try {
      const baseline = r.commit(
        "pages/privacy.tsx",
        staticPage + "\nexport const getStaticProps = () => ({props:{}});",
      );
      const current = r.commit("pages/privacy.tsx", staticPage);
      assert.equal(classifyChanges(r.cwd, baseline, current).scope, "full");
    } finally {
      r.clean();
    }
  });

  for (const file of [
    "lib/notion.ts",
    "lib/server/studio-static-props.ts",
    "components/Header.tsx",
    "site.config.ts",
    "pages/_app.tsx",
    "pages/[id].tsx",
    "pages/api/example.tsx",
    "pages/admin.tsx",
  ]) {
    void it(`retains full coverage when ${file} also changes`, () => {
      const r = staticFixture();
      try {
        r.commit(
          "pages/privacy.tsx",
          staticPage.replace('"Privacy"', '"Updated"'),
        );
        const current = r.commit(file, staticPage);
        assert.equal(classifyChanges(r.cwd, r.baseline, current).scope, "full");
      } finally {
        r.clean();
      }
    });
  }

  for (const css of [
    ":global(body) { color: red; }",
    "body { color: red; }",
    ".page, body { color: red; }",
    ".page + main { color: red; }",
    '@import "other.css";',
    ".page { composes: shared from './other.module.css'; }",
  ]) {
    void it("retains full coverage for CSS that can escape the page", () => {
      const r = staticFixture();
      try {
        const current = r.commit("pages/privacy.module.css", css);
        assert.equal(classifyChanges(r.cwd, r.baseline, current).scope, "full");
      } finally {
        r.clean();
      }
    });
  }

  void it("retains full coverage for a shared CSS module", () => {
    const r = staticFixture();
    try {
      const baseline = r.commit(
        "components/Other.tsx",
        'import styles from "../pages/privacy.module.css";',
      );
      const current = r.commit(
        "pages/privacy.module.css",
        ".page { color: blue; }",
      );
      assert.equal(classifyChanges(r.cwd, baseline, current).scope, "full");
    } finally {
      r.clean();
    }
  });

  void it("retains full coverage if the analyzer is unavailable", () => {
    const r = staticFixture();
    const original = process.env.STATIC_PAGE_TYPESCRIPT_PATH;
    try {
      const current = r.commit(
        "pages/privacy.module.css",
        ".page { color: blue; }",
      );
      process.env.STATIC_PAGE_TYPESCRIPT_PATH = path.join(
        r.cwd,
        "missing-compiler.cjs",
      );
      assert.equal(classifyChanges(r.cwd, r.baseline, current).scope, "full");
    } finally {
      if (original === undefined)
        delete process.env.STATIC_PAGE_TYPESCRIPT_PATH;
      else process.env.STATIC_PAGE_TYPESCRIPT_PATH = original;
      r.clean();
    }
  });

  for (const consumer of [
    'import Privacy from "@/pages/privacy";',
    'import Privacy from "pages/privacy";',
    'export {default} from "../pages/privacy.js";',
    'const page = import("../pages/privacy");',
    'const page = require("../pages/privacy");',
    'const page = (require)("../pages/privacy");',
    'const page = module.require("../pages/privacy");',
    'const load = require; const page = load("../pages/privacy");',
    'import {createRequire as factory} from "node:module"; const load = factory(import.meta.url); const page = load("../pages/privacy");',
    'const load = Function("return require")(); const page = load("../pages/privacy");',
    'const page = import("../pages/" + route);',
    'const target = "../pages/privacy"; const page = import(target);',
    'const target = "https://example.test/module.js"; function load(target: string) { return import(target); }',
    'const pages = import.meta.glob("../pages/*.tsx");',
  ]) {
    void it(`retains full coverage for inbound or unresolved runtime dependency: ${consumer}`, () => {
      const r = staticFixture();
      try {
        const baseline = r.commit("components/Consumer.tsx", consumer);
        const current = r.commit(
          "pages/privacy.tsx",
          staticPage.replace('"Privacy"', '"Updated"'),
        );
        assert.equal(classifyChanges(r.cwd, baseline, current).scope, "full");
      } finally {
        r.clean();
      }
    });
  }

  void it("follows runtime imports into otherwise excluded tooling directories", () => {
    const r = staticFixture();
    try {
      r.commit(
        "scripts/shared.ts",
        'export {default} from "../pages/privacy";',
      );
      const baseline = r.commit(
        "components/Consumer.tsx",
        'import Privacy from "../scripts/shared";',
      );
      const current = r.commit(
        "pages/privacy.module.css",
        ".page { color: blue; }",
      );
      assert.equal(classifyChanges(r.cwd, baseline, current).scope, "full");
    } finally {
      r.clean();
    }
  });

  void it("accepts an immutable external module URL without mistaking a shadowed variable for it", () => {
    const r = staticFixture();
    try {
      const baseline = r.commit(
        "components/External.tsx",
        'const target = "https://example.test/module.js"; export function load() { return import(target); }',
      );
      const current = r.commit(
        "pages/privacy.module.css",
        ".page { color: blue; }",
      );
      assert.equal(
        classifyChanges(r.cwd, baseline, current).scope,
        "representative",
      );
    } finally {
      r.clean();
    }
  });

  void it("retains full coverage for a static-page deletion or symlink", () => {
    const r = staticFixture();
    try {
      r.git("rm", "pages/privacy.tsx");
      r.git("commit", "-qm", "delete");
      assert.equal(
        classifyChanges(r.cwd, r.baseline, r.git("rev-parse", "HEAD")).scope,
        "full",
      );
      symlinkSync("../shared.tsx", path.join(r.cwd, "pages/privacy.tsx"));
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
