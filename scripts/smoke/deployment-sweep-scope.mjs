import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const commitSha = /^[a-f0-9]{40}$/i;
const deckFile = /^public\/decks\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/;
const deckPath = /^\/decks\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/;
const canaries = [
  "/",
  "/chat",
  "/studio",
  "/experience-background",
  "/aws",
  "/beluga",
];
/** @param {string} reason @returns {{scope: "full", reason: string, paths: string[]}} */
const full = (reason) => ({ scope: "full", reason, paths: [] });

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function classifyChanges(cwd, baselineSha, currentSha) {
  try {
    if (!commitSha.test(baselineSha) || !commitSha.test(currentSha))
      return full("invalid commit metadata");
    if (git(cwd, "rev-parse", "HEAD").trim() !== currentSha)
      return full("checkout does not match deployment");
    git(cwd, "merge-base", "--is-ancestor", baselineSha, currentSha);
    const entries = git(
      cwd,
      "diff",
      "--name-status",
      "--no-renames",
      "-z",
      baselineSha,
      currentSha,
      "--",
    )
      .split("\0")
      .filter(Boolean);
    if (!entries.length || entries.length % 2)
      return full("empty or invalid diff");
    const paths = [];
    for (let i = 0; i < entries.length; i += 2) {
      const [status, file] = entries.slice(i, i + 2);
      if (!["A", "M"].includes(status) || !deckFile.test(file))
        return full("change can affect content rendering");
      // A .html symlink can point outside the static deck; extensions alone are insufficient.
      const tree = git(cwd, "ls-tree", currentSha, "--", file);
      if (!tree.startsWith("100644 blob "))
        return full("deck is not a regular static file");
      paths.push(file.slice("public".length));
    }
    if (paths.length > 20)
      return full("too many changed decks for representative coverage");
    return {
      scope: "representative",
      reason: "verified deck-only change",
      baselineSha,
      currentSha,
      paths: [...canaries, ...paths],
    };
  } catch {
    return full("Git history unavailable or deployment is a rollback");
  }
}

/** @param {unknown} plan @returns {string[] | null} */
export function representativePaths(plan) {
  if (
    !plan ||
    typeof plan !== "object" ||
    !("scope" in plan) ||
    plan.scope !== "representative" ||
    !("paths" in plan) ||
    !Array.isArray(plan.paths)
  )
    return null;
  const paths = plan.paths;
  if (
    paths.length <= canaries.length ||
    paths.length > canaries.length + 20 ||
    new Set(paths).size !== paths.length
  )
    return null;
  if (!canaries.every((p) => paths.includes(p))) return null;
  if (
    !paths.every(
      (p) =>
        typeof p === "string" && (canaries.includes(p) || deckPath.test(p)),
    )
  )
    return null;
  return paths;
}

// Only read-only GitHub metadata is requested. Do not follow redirects with the token.
async function githubJson(repository, token, suffix) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}${suffix}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error("GitHub metadata unavailable");
  return response.json();
}

/**
 * @param {{cwd: string, eventName: string, event: unknown, requestJson: (suffix: string) => Promise<unknown>}} options
 */
export async function resolveSweepPlan({ cwd, eventName, event, requestJson }) {
  try {
    if (eventName !== "deployment_status")
      return full("manual runs retain full coverage");
    // Event/API data is untrusted. Invalid shapes throw into the full-coverage fallback.
    const deployment = event?.deployment;
    const status = event?.deployment_status;
    const branch = event?.repository?.default_branch;
    if (
      status?.state !== "success" ||
      status.environment !== "Production" ||
      deployment?.environment !== "Production" ||
      !Number.isSafeInteger(deployment.id) ||
      !commitSha.test(deployment.sha) ||
      !/^[a-zA-Z0-9_/-]+$/.test(branch ?? "")
    )
      return full("invalid Production event");
    if (
      git(cwd, "rev-parse", `refs/remotes/origin/${branch}`).trim() !==
      deployment.sha
    )
      return full("deployment event is not the latest branch revision");
    const cutoff = Date.parse(status.created_at);
    if (!Number.isFinite(cutoff)) return full("missing deployment timestamp");
    const deployments = await requestJson(
      "/deployments?environment=Production&per_page=20",
    );
    if (
      !Array.isArray(deployments) ||
      !deployments.some(
        (d) => d.id === deployment.id && d.sha === deployment.sha,
      )
    )
      return full("current deployment absent from bounded history");
    if (
      deployments.some(
        (d) => d.environment === "Production" && d.id > deployment.id,
      )
    )
      return full("newer Production deployment exists");
    const previous = deployments
      .filter(
        (d) =>
          d.environment === "Production" &&
          Number.isSafeInteger(d.id) &&
          d.id < deployment.id,
      )
      .sort((a, b) => b.id - a.id);
    const activated = [];
    let newerReadyAt = Infinity;
    for (const candidate of previous) {
      const statuses = await requestJson(
        `/deployments/${candidate.id}/statuses?per_page=100`,
      );
      if (
        !Array.isArray(statuses) ||
        statuses.length === 0 ||
        statuses.length >= 100
      )
        return full("incomplete deployment status history");
      const successes = statuses.filter((s) => s.state === "success");
      if (!successes.length) continue;
      if (!["success", "inactive"].includes(statuses[0]?.state))
        return full("ambiguous latest deployment state");
      const readyAt = Math.max(
        ...successes.map((s) => Date.parse(s.created_at)),
      );
      // Creation order is not activation order when builds overlap or an old release is promoted.
      // Refuse to reduce coverage for an ambiguous activation history.
      if (
        !Number.isFinite(readyAt) ||
        readyAt >= cutoff ||
        readyAt >= newerReadyAt
      )
        return full("ambiguous deployment activation order");
      newerReadyAt = readyAt;
      if (!commitSha.test(candidate.sha)) return full("invalid baseline");
      activated.push({ candidate, readyAt });
    }
    const baseline = activated[0];
    if (baseline) {
      const { candidate, readyAt } = baseline;
      const runs = await requestJson(
        `/actions/workflows/sitemap-availability.yml/runs?event=deployment_status&per_page=20`,
      );
      if (!Array.isArray(runs?.workflow_runs))
        return full("invalid verification history");
      const applicable = runs.workflow_runs
        .filter(
          (run) =>
            Number.isSafeInteger(run.id) &&
            run.event === "deployment_status" &&
            Date.parse(run.created_at) >= readyAt &&
            Date.parse(run.created_at) < cutoff,
        )
        .toSorted((a, b) => b.id - a.id);
      const run = applicable[0];
      // A later failed, cancelled or unfinished check must not be hidden by an earlier green run.
      if (
        !run ||
        run.head_sha !== candidate.sha ||
        run.conclusion !== "success" ||
        !(Date.parse(run.updated_at) < cutoff)
      )
        return full("latest baseline verification did not succeed");
      const jobs = await requestJson(
        `/actions/runs/${run.id}/jobs?per_page=100`,
      );
      // A skipped preview/non-success job is not executed Production verification.
      if (
        !Array.isArray(jobs?.jobs) ||
        !jobs.jobs.some(
          (j) => j.name === "Sitemap sweep" && j.conclusion === "success",
        )
      )
        return full("baseline sweep was not executed successfully");
      return classifyChanges(cwd, candidate.sha, deployment.sha);
    }
    return full("no verified Production baseline in bounded history");
  } catch {
    return full("scope lookup failed; retaining full coverage");
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  let plan = full("scope metadata unavailable");
  try {
    const repository = process.env.GITHUB_REPOSITORY ?? "";
    const token = process.env.GITHUB_TOKEN;
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository) || !token)
      throw new Error("missing repository metadata");
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
    );
    if (event.repository?.full_name !== repository)
      throw new Error("mismatched repository");
    const deadline = AbortSignal.timeout(45_000);
    plan = await resolveSweepPlan({
      cwd: process.cwd(),
      eventName: process.env.GITHUB_EVENT_NAME ?? "",
      event,
      requestJson: (suffix) => {
        deadline.throwIfAborted();
        return githubJson(repository, token, suffix);
      },
    });
  } catch {
    // No raw API errors, event payloads or token values enter workflow output.
  }
  writeFileSync("deployment-sweep-plan.json", `${JSON.stringify(plan)}\n`);
  console.log(`Deployment verification scope: ${plan.scope} (${plan.reason})`);
}
