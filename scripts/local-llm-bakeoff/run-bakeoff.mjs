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
 * @typedef {{ baseUrl: string; apiToken?: string; variants: Variant[]; items: FixtureItem[]; resultsPath: string; statePath: string; reps: number; fetchImpl?: typeof fetch; now?: () => number; readMemory?: () => Promise<number>; signal?: AbortSignal; log?: (line: string) => void }} RunOptions
 * @typedef {Awaited<ReturnType<typeof openResultsStore>>} ResultsStore
 */

const DEFAULT_MAX_TOKENS = 1024;
const WARMUP_REQUESTS = 2;
const BACKGROUND_STREAMS = 2;
const BACKGROUND_RETRY_MS = 250;
export const BACKGROUND_PROMPT =
  "Write a detailed 1,500-word essay on the history of cartography.";

/**
 * @param {Pick<RunOptions, "baseUrl" | "apiToken" | "fetchImpl" | "now">} options
 * @param {Variant} variant
 * @param {FixtureItem} item
 * @param {Record<string, unknown>} extras
 * @param {AbortSignal} [signal]
 */
async function streamCompletion(options, variant, item, extras, signal) {
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
    signal,
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
  if (candidates.length === 0) {
    return variant.requestExtras ?? {};
  }
  const probeItem = options.items[0];
  /** @type {{ extras: Record<string, unknown>; reasoningChars: number } | null} */
  let best = null;
  for (const [index, extras] of candidates.entries()) {
    const identity = {
      variant: variant.id,
      pass: "probe",
      itemId: probeItem.id,
      rep: index,
    };
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
          ok: true,
          extras,
          ...metrics,
        });
      }
      if (best === null || metrics.reasoningChars < best.reasoningChars) {
        best = { extras, reasoningChars: metrics.reasoningChars };
      }
    } catch (error) {
      if (!store.has(identity)) {
        await store.append({
          ...identity,
          key: variant.key,
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
 * @param {RunOptions} options
 * @param {ResultsStore} store
 * @param {Variant} variant
 * @param {FixtureItem} item
 * @param {Record<string, unknown>} extras
 * @param {"baseline" | "concurrent"} pass
 * @param {number} rep
 * @param {(line: string) => void} log
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
    return;
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
    await store.append({
      ...identity,
      key: variant.key,
      startedAt,
      ok: true,
      extras,
      ...metrics,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      return; // left unwritten so a resumed run measures it
    }
    log(
      `[${variant.id}] ${pass} ${item.id} rep ${rep} failed: ${messageOf(error)}`,
    );
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

/**
 * Keeps one long generation in flight until `stopSignal` fires, standing in
 * for a second consumer of the same server.
 * @param {RunOptions} options
 * @param {Variant} variant
 * @param {Record<string, unknown>} extras
 * @param {AbortSignal} stopSignal
 */
async function runBackground(options, variant, extras, stopSignal) {
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
    } catch {
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

  for (let rep = 1; rep <= options.reps; rep += 1) {
    for (const item of options.items) {
      if (options.signal?.aborted) {
        return;
      }
      await measureOne(
        options,
        store,
        variant,
        item,
        extras,
        "baseline",
        rep,
        log,
      );
      await sampleMemory();
    }
  }

  const stop = new AbortController();
  const background = Array.from({ length: BACKGROUND_STREAMS }, () =>
    runBackground(options, variant, extras, stop.signal),
  );
  try {
    for (const item of options.items) {
      if (options.signal?.aborted) {
        return;
      }
      await measureOne(
        options,
        store,
        variant,
        item,
        extras,
        "concurrent",
        1,
        log,
      );
      await sampleMemory();
    }
  } finally {
    stop.abort();
    await Promise.all(background);
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
    });
  }
  await admin.unloadAllLlms();
  log(`[${variant.id}] done`);
}

/** @param {RunOptions} options */
export async function runBakeoff(options) {
  const log =
    options.log ??
    ((line) => console.log(`${new Date().toISOString()} ${line}`));
  const readMemory = options.readMemory ?? readUsedMemoryBytes;
  const admin = createLmStudioAdmin(options);
  const store = await openResultsStore(options.resultsPath);
  const snapshot = await admin.loadedLlmInstances();
  await writeFile(
    options.statePath,
    JSON.stringify({ takenAt: new Date().toISOString(), snapshot }, null, 2),
  );
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
  if (!match) {
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
    process.once(signalName, () => {
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
        reps: Number(values.reps),
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
