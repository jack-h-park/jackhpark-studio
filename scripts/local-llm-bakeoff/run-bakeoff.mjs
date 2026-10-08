#!/usr/bin/env node
// scripts/local-llm-bakeoff/run-bakeoff.mjs
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { readUsedMemoryBytes } from "./host-memory.mjs";
import { createLmStudioAdmin } from "./lmstudio-admin.mjs";
import { openResultsStore } from "./results-store.mjs";
import { measureChatStream } from "./stream-metrics.mjs";

/**
 * @typedef {{ role: "system" | "user" | "assistant"; content: string }} ChatMessage
 * @typedef {{ id: string; lang: string; kind: string; messages: ChatMessage[]; temperature: number | null; maxTokens: number | null }} FixtureItem
 * @typedef {{ id: string; key: string; role: string; downloadRef: string | null; loadConfig: Record<string, unknown>; requestExtras: Record<string, unknown>; thinkingCandidates?: Record<string, unknown>[] }} Variant
 * @typedef {{ baseUrl: string; apiToken?: string; variants: Variant[]; items: FixtureItem[]; resultsPath: string; statePath: string; reps: number; requestTimeoutMs?: number; fetchImpl?: typeof fetch; now?: () => number; readMemory?: () => Promise<number>; signal?: AbortSignal; log?: (line: string) => void }} RunOptions
 * @typedef {Awaited<ReturnType<typeof openResultsStore>>} ResultsStore
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
      messages: item.messages,
      ...(item.temperature === null ? {} : { temperature: item.temperature }),
      max_tokens: item.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      ...extras,
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
  log,
) {
  const identity = { variant: variant.id, pass, itemId: item.id, rep };
  if (store.has(identity)) {
    return { status: "skipped" };
  }
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

/**
 * @param {RunOptions} options
 * @param {ReturnType<typeof createLmStudioAdmin>} admin
 * @param {ResultsStore} store
 * @param {Variant} variant
 * @param {() => Promise<number>} readMemory
 * @param {(line: string) => void} log
 */
async function runVariant(options, admin, store, variant, readMemory, log) {
  if (variantComplete(options, store, variant)) {
    log(`[${variant.id}] already complete, skipping`);
    return;
  }
  await admin.unloadAllLlms();
  const idleBytes = await readMemory();
  log(`[${variant.id}] loading ${variant.key}`);
  await admin.load(variant.key, variant.loadConfig ?? {});
  let peakBytes = await readMemory();
  const sampleMemory = async () => {
    peakBytes = Math.max(peakBytes, await readMemory());
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
  await admin.unloadAllLlms();
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
 * @returns {Promise<{ takenAt: string; snapshot: Awaited<ReturnType<ReturnType<typeof createLmStudioAdmin>["loadedLlmInstances"]>> } | null>}
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

/** @param {RunOptions} options */
export async function runBakeoff(options) {
  assertRunnable(options.reps, options.items);
  const log =
    options.log ??
    ((line) => console.log(`${new Date().toISOString()} ${line}`));
  const readMemory = options.readMemory ?? readUsedMemoryBytes;
  const admin = createLmStudioAdmin(options);
  const store = await openResultsStore(options.resultsPath);
  const unrestored = await readUnrestoredState(options.statePath);
  let takenAt;
  let snapshot;
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
  log(
    `snapshot: ${snapshot.map((s) => `${s.modelKey}@${s.contextLength}`).join(", ") || "(nothing loaded)"}`,
  );
  try {
    for (const variant of options.variants) {
      if (options.signal?.aborted) {
        break;
      }
      try {
        await runVariant(options, admin, store, variant, readMemory, log);
      } catch (error) {
        log(`[${variant.id}] aborted: ${messageOf(error)}`);
      }
    }
  } finally {
    log("restoring snapshot");
    await admin.restore(snapshot);
    await writeFile(
      options.statePath,
      JSON.stringify(
        { takenAt, snapshot, restoredAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    log("restored");
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
      const { snapshot } = JSON.parse(
        await readFile(values.state ?? "state.json", "utf8"),
      );
      await createLmStudioAdmin(base).restore(snapshot);
      console.log("restored");
      return;
    }
    case "run": {
      if (!values.fixture) {
        throw new Error("--fixture is required for --mode run");
      }
      const { items } = JSON.parse(await readFile(values.fixture, "utf8"));
      const reps = Number(values.reps);
      assertRunnable(reps, items);
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
