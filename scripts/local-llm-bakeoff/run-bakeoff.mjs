#!/usr/bin/env node
// scripts/local-llm-bakeoff/run-bakeoff.mjs
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { readMemoryHeadroom, readUsedMemoryBytes } from "./host-memory.mjs";
import { createLmStudioAdmin } from "./lmstudio-admin.mjs";
import { acquirePreloadHold, clearOwnPreloadHold } from "./preload-hold.mjs";
import { openResultsStore } from "./results-store.mjs";
import { measureChatStream } from "./stream-metrics.mjs";

/**
 * @typedef {{ role: "system" | "user" | "assistant"; content: string }} ChatMessage
 * @typedef {{ id: string; lang: string; kind: string; messages: ChatMessage[]; temperature: number | null; maxTokens: number | null }} FixtureItem
 * @typedef {{ id: string; key: string; role: string; downloadRef: string | null; loadConfig: Record<string, unknown>; requestExtras: Record<string, unknown>; thinkingCandidates?: Record<string, unknown>[] }} Variant
 * @typedef {{ baseUrl: string; apiToken?: string; variants: Variant[]; items: FixtureItem[]; resultsPath: string; statePath: string; reps: number; requestTimeoutMs?: number; fetchImpl?: typeof fetch; now?: () => number; readMemory?: () => Promise<number>; readHeadroom?: () => Promise<Headroom>; preloadHoldPath?: string; signal?: AbortSignal; log?: (line: string) => void }} RunOptions
 * @typedef {{ freeInactiveBytes: number; swapUsedBytes: number }} Headroom
 * @typedef {Awaited<ReturnType<typeof openResultsStore>>} ResultsStore
 * @typedef {import("./lmstudio-admin.mjs").LoadedInstance} LoadedInstance
 */

const DEFAULT_MAX_TOKENS = 1024;
const WARMUP_REQUESTS = 2;
const BACKGROUND_STREAMS = 2;
const BACKGROUND_RETRY_MS = 250;
// A stalled stream must fail rather than hang, or the restore in `finally`
// is never reached.
const REQUEST_TIMEOUT_MS = 300_000;
// Consecutive failed measurements that mean the server is down, not that the
// items are bad.
const MAX_CONSECUTIVE_FAILURES = 3;
// The host's stop rule for experiments: the machine also runs always-on ops
// work, so a run ends as soon as either line is crossed.
const GIB = 1024 ** 3;
const STOP_FREE_INACTIVE_BYTES = 12 * GIB;
const STOP_SWAP_GROWTH_BYTES = 1 * GIB;
const STOP_FREE_INACTIVE_LABEL = `${STOP_FREE_INACTIVE_BYTES / GIB} GiB`;
// Longer than the agreed five-hour window, so the hold outlives a full run;
// the run releases it after its restore, and the host caps any hold anyway.
const PRELOAD_HOLD_SECONDS = 6 * 3600;
export const BACKGROUND_PROMPT =
  "Write a detailed 1,500-word essay on the history of cartography.";

/**
 * @param {Pick<RunOptions, "baseUrl" | "apiToken" | "fetchImpl" | "now" | "requestTimeoutMs">} options
 * @param {Variant} variant
 * @param {FixtureItem} item
 * @param {Record<string, unknown>} extras
 * @param {AbortSignal} [signal]
 */
async function streamCompletion(options, variant, item, extras, signal) {
  const timeout = AbortSignal.timeout(
    options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => performance.now());
  // `assistantPrefill` is not a request field: it becomes a trailing assistant
  // turn that LM Studio continues. An empty think block there is the one
  // thinking switch the Qwen MLX builds honor; LM Studio does not forward
  // `chat_template_kwargs` to their templates.
  const { assistantPrefill, ...bodyExtras } = extras;
  const messages =
    typeof assistantPrefill === "string"
      ? [...item.messages, { role: "assistant", content: assistantPrefill }]
      : item.messages;
  const startedAt = now();
  const response = await fetchImpl(`${options.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiToken
        ? { Authorization: `Bearer ${options.apiToken}` }
        : {}),
    },
    body: JSON.stringify({
      model: variant.key,
      messages,
      ...(item.temperature === null ? {} : { temperature: item.temperature }),
      max_tokens: item.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      ...bodyExtras,
    }),
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `chat completion failed: HTTP ${response.status} ${await response.text()}`.trim(),
    );
  }
  return measureChatStream(response.body, startedAt, now);
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {RunOptions} options
 * @param {ResultsStore} store
 * @param {Variant} variant
 */
function variantComplete(options, store, variant) {
  /** @type {{ variant: string; pass: string; itemId: string; rep: number }[]} */
  const rows = [{ variant: variant.id, pass: "memory", itemId: "-", rep: 0 }];
  for (let rep = 1; rep <= options.reps; rep += 1) {
    for (const item of options.items) {
      rows.push({
        variant: variant.id,
        pass: "baseline",
        itemId: item.id,
        rep,
      });
    }
  }
  for (const item of options.items) {
    rows.push({
      variant: variant.id,
      pass: "concurrent",
      itemId: item.id,
      rep: 1,
    });
  }
  return rows.every((row) => store.has(row));
}

/**
 * Tries each thinking-control candidate once and keeps the one that produced
 * the least reasoning. Some models (gpt-oss) cannot turn reasoning off, so
 * "least" rather than "zero" is the rule.
 * @param {RunOptions} options
 * @param {ResultsStore} store
 * @param {Variant} variant
 * @param {(line: string) => void} log
 * @returns {Promise<Record<string, unknown>>}
 */
async function chooseRequestExtras(options, store, variant, log) {
  const candidates = variant.thinkingCandidates ?? [];
  const baseExtras = variant.requestExtras ?? {};
  if (candidates.length === 0) {
    return baseExtras;
  }
  const probeItem = options.items[0];
  /** @type {{ extras: Record<string, unknown>; reasoningChars: number } | null} */
  let best = null;
  for (const [index, candidate] of candidates.entries()) {
    const extras = { ...baseExtras, ...candidate };
    const identity = {
      variant: variant.id,
      pass: "probe",
      itemId: probeItem.id,
      rep: index,
    };
    const startedAt = new Date().toISOString();
    try {
      const metrics = await streamCompletion(
        options,
        variant,
        probeItem,
        extras,
        options.signal,
      );
      if (!store.has(identity)) {
        await store.append({
          ...identity,
          key: variant.key,
          startedAt,
          ok: true,
          extras,
          ...metrics,
        });
      }
      if (best === null || metrics.reasoningChars < best.reasoningChars) {
        best = { extras, reasoningChars: metrics.reasoningChars };
      }
    } catch (error) {
      if (options.signal?.aborted) {
        throw error; // no probe row: a resumed run probes this candidate again
      }
      if (!store.has(identity)) {
        await store.append({
          ...identity,
          key: variant.key,
          startedAt,
          ok: false,
          extras,
          error: messageOf(error),
        });
      }
    }
  }
  if (best === null) {
    throw new Error(
      `every thinking-control candidate failed for ${variant.id}`,
    );
  }
  log(
    `[${variant.id}] request extras ${JSON.stringify(best.extras)} (reasoning chars ${best.reasoningChars})`,
  );
  return best.extras;
}

/**
 * Measures one item. The row is returned rather than written so the caller can
 * hold back a failure streak (see `createPassRecorder`).
 * @typedef {{ status: "skipped" | "aborted" } | { status: "ok" | "failed"; row: Record<string, unknown> & { variant: string; pass: string; itemId: string; rep: number } }} Outcome
 * @param {RunOptions} options
 * @param {ResultsStore} store
 * @param {Variant} variant
 * @param {FixtureItem} item
 * @param {Record<string, unknown>} extras
 * @param {"baseline" | "concurrent"} pass
 * @param {number} rep
 * @param {Set<string>} sentItems items already sent since this model loaded
 * @param {(line: string) => void} log
 * @returns {Promise<Outcome>}
 */
async function measureOne(
  options,
  store,
  variant,
  item,
  extras,
  pass,
  rep,
  sentItems,
  log,
) {
  const identity = { variant: variant.id, pass, itemId: item.id, rep };
  if (store.has(identity)) {
    return { status: "skipped" };
  }
  // LM Studio keeps a prompt cache for the life of a load, so a prompt sent
  // before answers its first token far sooner than a visitor's new question
  // would. The flag lets the report keep those times out of TTFT.
  const promptSeen = sentItems.has(item.id);
  sentItems.add(item.id);
  const startedAt = new Date().toISOString();
  try {
    const metrics = await streamCompletion(
      options,
      variant,
      item,
      extras,
      options.signal,
    );
    return {
      status: "ok",
      row: {
        ...identity,
        key: variant.key,
        startedAt,
        ok: true,
        extras,
        promptSeen,
        ...metrics,
      },
    };
  } catch (error) {
    if (options.signal?.aborted) {
      return { status: "aborted" }; // left unwritten so a resumed run measures it
    }
    log(
      `[${variant.id}] ${pass} ${item.id} rep ${rep} failed: ${messageOf(error)}`,
    );
    return {
      status: "failed",
      row: {
        ...identity,
        key: variant.key,
        startedAt,
        ok: false,
        extras,
        promptSeen,
        error: messageOf(error),
      },
    };
  }
}

/**
 * Failed rows are held until a later success proves the server is alive. A
 * streak of MAX_CONSECUTIVE_FAILURES is an outage: the buffered rows are
 * dropped and the error leaves the variant incomplete so a resume redoes it.
 * @param {ResultsStore} store
 */
function createPassRecorder(store) {
  /** @type {Extract<Outcome, { row: unknown }>["row"][]} */
  let pending = [];
  /** @param {Extract<Outcome, { row: unknown }>["row"]} row */
  const write = async (row) => {
    if (!store.has(row)) {
      await store.append(row);
    }
  };
  const flush = async () => {
    const rows = pending;
    pending = [];
    for (const row of rows) {
      await write(row);
    }
  };
  return {
    /** @param {Outcome} outcome */
    async record(outcome) {
      if (outcome.status === "ok") {
        await flush();
        await write(outcome.row);
      } else if (outcome.status === "failed") {
        pending.push(outcome.row);
        if (pending.length >= MAX_CONSECUTIVE_FAILURES) {
          const count = pending.length;
          pending = [];
          throw new Error(`server unhealthy: ${count} consecutive failures`);
        }
      }
    },
    flush,
  };
}

/**
 * Keeps one long generation in flight until `stopSignal` fires, standing in
 * for a second consumer of the same server.
 * @param {RunOptions} options
 * @param {Variant} variant
 * @param {Record<string, unknown>} extras
 * @param {AbortSignal} stopSignal
 * @param {{ ok: number; failed: number; lastError: string | null }} stats
 */
async function runBackground(options, variant, extras, stopSignal, stats) {
  const signal = options.signal
    ? AbortSignal.any([stopSignal, options.signal])
    : stopSignal;
  /** @type {FixtureItem} */
  const item = {
    id: "background",
    lang: "en",
    kind: "background",
    messages: [{ role: "user", content: BACKGROUND_PROMPT }],
    temperature: null,
    maxTokens: 1500,
  };
  while (!signal.aborted) {
    try {
      await streamCompletion(options, variant, item, extras, signal);
      if (!signal.aborted) {
        stats.ok += 1;
      }
    } catch (error) {
      if (!signal.aborted) {
        stats.failed += 1;
        stats.lastError = messageOf(error);
      }
      await delay(BACKGROUND_RETRY_MS, undefined, { signal }).catch(() => {
        // Aborted while backing off; the loop condition ends the task.
      });
    }
  }
}

/** A memory stop-rule trip: ends the whole run, not just one variant. */
class StopRuleError extends Error {}

/** @param {number} bytes */
function formatGib(bytes) {
  return `${(bytes / GIB).toFixed(1)} GiB`;
}

/**
 * @param {() => Promise<Headroom>} readHeadroom
 * @param {number} startSwapBytes swap in use when the run started
 * @returns {() => Promise<void>} throws StopRuleError when a line is crossed
 */
function createStopRule(readHeadroom, startSwapBytes) {
  return async () => {
    const { freeInactiveBytes, swapUsedBytes } = await readHeadroom();
    if (freeInactiveBytes < STOP_FREE_INACTIVE_BYTES) {
      throw new StopRuleError(
        `free+inactive ${formatGib(freeInactiveBytes)} is under ${STOP_FREE_INACTIVE_LABEL}`,
      );
    }
    const growth = swapUsedBytes - startSwapBytes;
    if (growth > STOP_SWAP_GROWTH_BYTES) {
      throw new StopRuleError(
        `swap grew ${formatGib(growth)} since the run started`,
      );
    }
  };
}

/**
 * @param {RunOptions} options
 * @param {ReturnType<typeof createLmStudioAdmin>} admin
 * @param {ResultsStore} store
 * @param {Variant} variant
 * @param {() => Promise<number>} readMemory
 * @param {() => Promise<void>} checkStopRule
 * @param {(line: string) => void} log
 */
async function runVariant(
  options,
  admin,
  store,
  variant,
  readMemory,
  checkStopRule,
  log,
) {
  if (variantComplete(options, store, variant)) {
    log(`[${variant.id}] already complete, skipping`);
    return;
  }
  // Ctrl-C must be able to interrupt a slow load; the final restore is not
  // tied to the run signal, only to the admin client's own timeouts.
  const adminCall = { signal: options.signal };
  await admin.unloadAllLlms(adminCall);
  const idleBytes = await readMemory();
  log(`[${variant.id}] loading ${variant.key}`);
  await admin.load(variant.key, variant.loadConfig ?? {}, adminCall);
  await checkStopRule();
  let peakBytes = await readMemory();
  const sampleMemory = async () => {
    peakBytes = Math.max(peakBytes, await readMemory());
    await checkStopRule();
  };

  const extras = await chooseRequestExtras(options, store, variant, log);
  if (options.signal?.aborted) {
    return;
  }
  for (let i = 0; i < WARMUP_REQUESTS; i += 1) {
    await streamCompletion(
      options,
      variant,
      options.items[0],
      extras,
      options.signal,
    ).catch((error) =>
      log(`[${variant.id}] warmup failed: ${messageOf(error)}`),
    );
  }
  // The probe and the warmup both sent the first item.
  const sentItems = new Set([options.items[0].id]);

  const baselineRecorder = createPassRecorder(store);
  for (let rep = 1; rep <= options.reps; rep += 1) {
    for (const item of options.items) {
      if (options.signal?.aborted) {
        break;
      }
      await baselineRecorder.record(
        await measureOne(
          options,
          store,
          variant,
          item,
          extras,
          "baseline",
          rep,
          sentItems,
          log,
        ),
      );
      await sampleMemory();
    }
  }
  await baselineRecorder.flush();
  if (options.signal?.aborted) {
    return;
  }

  const stop = new AbortController();
  const background = {
    ok: 0,
    failed: 0,
    lastError: /** @type {string | null} */ (null),
  };
  const backgroundTasks = Array.from({ length: BACKGROUND_STREAMS }, () =>
    runBackground(options, variant, extras, stop.signal, background),
  );
  const concurrentRecorder = createPassRecorder(store);
  try {
    for (const item of options.items) {
      if (options.signal?.aborted) {
        break;
      }
      await concurrentRecorder.record(
        await measureOne(
          options,
          store,
          variant,
          item,
          extras,
          "concurrent",
          1,
          sentItems,
          log,
        ),
      );
      await sampleMemory();
    }
    await concurrentRecorder.flush();
  } finally {
    stop.abort();
    await Promise.all(backgroundTasks);
  }
  log(
    `[${variant.id}] background ok=${background.ok} failed=${background.failed}`,
  );
  if (options.signal?.aborted) {
    return;
  }

  const memoryRow = {
    variant: variant.id,
    pass: "memory",
    itemId: "-",
    rep: 0,
  };
  if (!store.has(memoryRow)) {
    await store.append({
      ...memoryRow,
      key: variant.key,
      idleBytes,
      peakBytes,
      deltaBytes: peakBytes - idleBytes,
      background,
    });
  }
  await admin.unloadAllLlms(adminCall);
  log(`[${variant.id}] done`);
}

/**
 * @param {number} reps
 * @param {FixtureItem[]} items
 */
function assertRunnable(reps, items) {
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error(`--reps must be a positive integer, got ${reps}`);
  }
  if (items.length === 0) {
    throw new Error("the fixture has no items");
  }
}

/**
 * The state file is the only record of what else was loaded on the server. A
 * file without `restoredAt` means a previous run died before restoring, so its
 * snapshot is kept instead of being replaced by the half-run state.
 * @param {string} statePath
 * @returns {Promise<{ takenAt: string; snapshot: LoadedInstance[] } | null>}
 */
async function readUnrestoredState(statePath) {
  let text;
  try {
    text = await readFile(statePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const state = JSON.parse(text);
  return state.restoredAt ? null : state;
}

/**
 * Reloads a snapshot and marks the state file as restored, so the next run
 * takes a fresh snapshot instead of reusing this one.
 * @param {ReturnType<typeof createLmStudioAdmin>} admin
 * @param {string} statePath
 * @param {string} takenAt
 * @param {LoadedInstance[]} snapshot
 */
async function restoreAndStamp(admin, statePath, takenAt, snapshot) {
  await admin.restore(snapshot);
  await writeFile(
    statePath,
    JSON.stringify(
      { takenAt, snapshot, restoredAt: new Date().toISOString() },
      null,
      2,
    ),
  );
}

/**
 * The `--mode restore` path: put back what a killed run recorded in the state
 * file. A snapshot already restored is refused unless forced: the server may
 * have been changed on purpose since then. A run killed hard also leaves its
 * preload hold behind; with `preloadHoldPath` the restore removes it, so the
 * host's residency loop watches its model again. A hold another experiment
 * wrote is left alone.
 * @param {Pick<RunOptions, "baseUrl" | "apiToken" | "fetchImpl">} options
 * @param {string} statePath
 * @param {{ force?: boolean; preloadHoldPath?: string }} [restoreOptions]
 */
export async function restoreFromStateFile(
  options,
  statePath,
  { force = false, preloadHoldPath } = {},
) {
  const { takenAt, snapshot, restoredAt } = JSON.parse(
    await readFile(statePath, "utf8"),
  );
  if (restoredAt && !force) {
    throw new Error(
      `${statePath} holds a snapshot taken ${takenAt} that was already restored at ${restoredAt}; rerun with --force to restore it again`,
    );
  }
  await restoreAndStamp(
    createLmStudioAdmin(options),
    statePath,
    takenAt,
    snapshot,
  );
  if (preloadHoldPath) {
    await clearOwnPreloadHold(preloadHoldPath);
  }
}

/** @param {RunOptions} options */
export async function runBakeoff(options) {
  assertRunnable(options.reps, options.items);
  const log =
    options.log ??
    ((line) => console.log(`${new Date().toISOString()} ${line}`));
  const readMemory = options.readMemory ?? readUsedMemoryBytes;
  const readHeadroom = options.readHeadroom ?? readMemoryHeadroom;
  const start = await readHeadroom();
  if (start.freeInactiveBytes < STOP_FREE_INACTIVE_BYTES) {
    throw new Error(
      `stop rule: free+inactive ${formatGib(start.freeInactiveBytes)} is under ${STOP_FREE_INACTIVE_LABEL}; not starting`,
    );
  }
  const checkStopRule = createStopRule(readHeadroom, start.swapUsedBytes);
  // Taken before anything else touches the server or the state file, so a run
  // that finds another experiment's hold leaves no trace.
  const hold = options.preloadHoldPath
    ? await acquirePreloadHold(options.preloadHoldPath, PRELOAD_HOLD_SECONDS)
    : null;
  if (hold) {
    log(`preload hold until ${new Date(hold.expiry * 1000).toISOString()}`);
  }
  const admin = createLmStudioAdmin(options);
  let store;
  let takenAt;
  let snapshot;
  try {
    store = await openResultsStore(options.resultsPath);
    const unrestored = await readUnrestoredState(options.statePath);
    if (unrestored) {
      ({ takenAt, snapshot } = unrestored);
      log(`reusing unrestored snapshot taken ${takenAt}`);
    } else {
      takenAt = new Date().toISOString();
      snapshot = await admin.loadedLlmInstances();
      await writeFile(
        options.statePath,
        JSON.stringify({ takenAt, snapshot }, null, 2),
      );
    }
  } catch (err) {
    await hold?.release();
    throw err;
  }
  log(
    `snapshot: ${snapshot.map((s) => `${s.modelKey}@${s.contextLength}`).join(", ") || "(nothing loaded)"}`,
  );
  try {
    for (const variant of options.variants) {
      if (options.signal?.aborted) {
        break;
      }
      try {
        await runVariant(
          options,
          admin,
          store,
          variant,
          readMemory,
          checkStopRule,
          log,
        );
      } catch (error) {
        if (error instanceof StopRuleError) {
          log(`stop rule tripped: ${error.message}; stopping the run`);
          break;
        }
        log(`[${variant.id}] aborted: ${messageOf(error)}`);
      }
    }
  } finally {
    try {
      log("restoring snapshot");
      await restoreAndStamp(admin, options.statePath, takenAt, snapshot);
      log("restored");
    } finally {
      // Released even when the restore failed: the host's residency loop
      // reloading its model is then the better outcome.
      await hold?.release();
      const incomplete = options.variants
        .filter((variant) => !variantComplete(options, store, variant))
        .map((variant) => variant.id);
      log(`incomplete variants: ${incomplete.join(", ") || "none"}`);
    }
  }
}

/** @param {Pick<RunOptions, "baseUrl" | "apiToken" | "fetchImpl" | "variants">} options */
export async function preflight(options) {
  const admin = createLmStudioAdmin(options);
  const keys = new Set((await admin.listModels()).map((model) => model.key));
  return {
    missing: options.variants.filter((v) => !keys.has(v.key)).map((v) => v.id),
    available: [...keys].sort(),
  };
}

/**
 * @param {string} hhmm local wall-clock time
 * @param {Date} from
 */
export function msUntil(hhmm, from) {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`--start-at expects HH:MM, got "${hhmm}"`);
  }
  const target = new Date(from);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (target.getTime() <= from.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - from.getTime();
}

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: "run" },
      "base-url": { type: "string", default: "http://127.0.0.1:1234" },
      manifest: { type: "string" },
      fixture: { type: "string" },
      out: { type: "string", default: "results.jsonl" },
      state: { type: "string", default: "state.json" },
      reps: { type: "string", default: "3" },
      only: { type: "string" },
      "start-at": { type: "string" },
      "preload-hold": { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  if (!values.manifest) {
    throw new Error("--manifest is required");
  }
  const manifest = JSON.parse(await readFile(values.manifest, "utf8"));
  const only = values.only ? new Set(values.only.split(",")) : null;
  /** @type {Variant[]} */
  const variants = manifest.variants.filter(
    /** @param {Variant} v */ (v) => only === null || only.has(v.id),
  );
  const base = {
    baseUrl: values["base-url"] ?? "http://127.0.0.1:1234",
    apiToken: process.env.LMSTUDIO_API_TOKEN || undefined,
    variants,
  };

  switch (values.mode) {
    case "preflight":
      console.log(JSON.stringify(await preflight(base), null, 2));
      return;
    case "download": {
      const admin = createLmStudioAdmin(base);
      for (const variant of variants.filter((v) => v.downloadRef)) {
        console.log(
          variant.id,
          JSON.stringify(await admin.download(String(variant.downloadRef))),
        );
      }
      return;
    }
    case "restore": {
      await restoreFromStateFile(base, values.state ?? "state.json", {
        force: values.force,
        preloadHoldPath: values["preload-hold"],
      });
      console.log("restored");
      return;
    }
    case "run": {
      if (!values.fixture) {
        throw new Error("--fixture is required for --mode run");
      }
      const fixture = JSON.parse(await readFile(values.fixture, "utf8"));
      if (!Array.isArray(fixture.items)) {
        throw new Error("fixture has no items array");
      }
      const { items } = fixture;
      const reps = Number(values.reps);
      assertRunnable(reps, items);
      const controller = new AbortController();
      for (const signalName of ["SIGINT", "SIGTERM"]) {
        process.on(signalName, () => {
          // A second Ctrl-C must not kill the process mid-restore.
          if (controller.signal.aborted) {
            console.log("restore in progress; please wait");
            return;
          }
          console.log(`${signalName}: stopping; the snapshot will be restored`);
          controller.abort();
        });
      }
      if (values["start-at"]) {
        const waitMs = msUntil(values["start-at"], new Date());
        console.log(
          `waiting ${Math.round(waitMs / 60000)} min until ${values["start-at"]}`,
        );
        await delay(waitMs, undefined, { signal: controller.signal });
      }
      await runBakeoff({
        ...base,
        items,
        resultsPath: values.out ?? "results.jsonl",
        statePath: values.state ?? "state.json",
        reps,
        preloadHoldPath: values["preload-hold"],
        signal: controller.signal,
      });
      console.log("done");
      return;
    }
    default:
      throw new Error(`unknown --mode ${values.mode}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
