/**
 * Diagnose which module import blocks `langchain_chat_impl_heavy` from loading.
 * Run via `pnpm diagnose:heavy-imports`. Set `STEP_TIMEOUT_MS`, `ONLY_STEP`,
 * or `CHAT_DEBUG=1` as needed to focus the trace.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

const ROOT = process.cwd();
const localEnv = path.join(ROOT, ".env.local");
const fallbackEnv = path.join(ROOT, ".env");
if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
}
if (fs.existsSync(fallbackEnv)) {
  dotenv.config({ path: fallbackEnv });
}

const STEP_TIMEOUT_MS = Number(process.env.STEP_TIMEOUT_MS ?? "8000");
const ONLY_STEP = process.env.ONLY_STEP;

const steps = [
  { name: "@langchain/core", target: "@langchain/core" },
  { name: "@langchain/openai", target: "@langchain/openai" },
  { name: "@langchain/community", target: "@langchain/community" },
  { name: "openai", target: "openai" },
  { name: "@supabase/supabase-js", target: "@supabase/supabase-js" },
  { name: "./lib/langfuse.node", target: pathToFileURL(path.join(ROOT, "lib/langfuse.node.ts")).href },
  { name: "./lib/core/supabase", target: pathToFileURL(path.join(ROOT, "lib/core/supabase.ts")).href },
  { name: "./lib/server/chat-guardrails", target: pathToFileURL(path.join(ROOT, "lib/server/chat-guardrails.ts")).href },
  { name: "./lib/server/chat-cache", target: pathToFileURL(path.join(ROOT, "lib/server/chat-cache.ts")).href },
  { name: "./lib/server/api/langchain_chat_impl_heavy", target: pathToFileURL(path.join(ROOT, "lib/server/api/langchain_chat_impl_heavy.ts")).href },
];

const importTarget = (target: string) => import(target);

const shouldRunStep = (stepIndex: number, stepName: string) => {
  if (!ONLY_STEP) {
    return true;
  }
  if (Number.isNaN(Number(ONLY_STEP))) {
    return stepName === ONLY_STEP;
  }
  return Number(ONLY_STEP) === stepIndex;
};

const runStep = async (
  stepIndex: number,
  stepName: string,
  target: string,
) => {
  if (!shouldRunStep(stepIndex, stepName)) {
    return;
  }
  const t0 = Date.now();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("STEP_TIMEOUT")), STEP_TIMEOUT_MS),
  );
  try {
    await Promise.race([importTarget(target), timeout]);
    console.log(
      `[trace-heavy] ok ${stepName} ${Date.now() - t0}ms (${target})`,
    );
  } catch (err) {
    if (err instanceof Error && err.message === "STEP_TIMEOUT") {
      console.error(
        `[trace-heavy] TIMEOUT ${stepName} after ${STEP_TIMEOUT_MS}ms (${target})`,
      );
      throw err;
    }
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    console.error(
      `[trace-heavy] ERROR ${stepName} ${code ?? "unknown"} ${
        err instanceof Error ? err.message : err
      } (${target})`,
    );
    throw err;
  }
};

const main = async () => {
  console.log("[trace-heavy] starting heavy import trace");
  console.log(
    `[trace-heavy] env SNAPSHOT LANGFUSE_PUBLIC_KEY=${
      process.env.LANGFUSE_PUBLIC_KEY ? "set" : "missing"
    } SUPABASE_URL=${process.env.SUPABASE_URL ? "set" : "missing"}`,
  );
  for (const [index, step] of steps.entries()) {
    await runStep(index, step.name, step.target);
  }
  console.log("[trace-heavy] completed all steps");
};

try {
  await main();
} catch (err) {
  console.error("[trace-heavy] fatal error", err);
  throw err;
}
