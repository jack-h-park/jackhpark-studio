import { setTimeout as delay } from "node:timers/promises";

/**
 * @typedef {Record<string, string | number | boolean>} LoadConfig
 * @typedef {{ modelKey: string; instanceId: string; contextLength: number | null; loadConfig?: LoadConfig }} LoadedInstance
 * @typedef {{ key: string; type: string; loaded_instances: { id: string; config?: Record<string, unknown> }[] }} LmStudioModel
 * @typedef {{ signal?: AbortSignal }} CallOptions
 */

// Instance settings that `/api/v1/models/load` accepts. The endpoint rejects
// unknown keys, so a snapshot replays only these; `parallel` (the slot count)
// is the one a resident model is easiest to lose on restore.
const RESTORABLE_LOAD_KEYS = [
  "context_length",
  "parallel",
  "reasoning_budget_message",
  "eval_batch_size",
  "flash_attention",
  "num_experts",
  "offload_kv_cache_to_gpu",
];

/**
 * @param {Record<string, unknown> | undefined} config
 * @returns {LoadConfig}
 */
function pickLoadConfig(config = {}) {
  /** @type {LoadConfig} */
  const picked = {};
  for (const key of RESTORABLE_LOAD_KEYS) {
    const value = config[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      picked[key] = value;
    }
  }
  return picked;
}

/** @param {LoadedInstance} instance @returns {LoadConfig} */
function snapshotLoadConfig(instance) {
  if (instance.loadConfig) {
    return instance.loadConfig;
  }
  // Snapshots written before load settings were kept carry only this.
  return instance.contextLength === null
    ? {}
    : { context_length: instance.contextLength };
}

// A cold load of a large model from disk can take many minutes; any other
// admin call that takes a minute means the server is stuck.
const DEFAULT_LOAD_TIMEOUT_MS = 900_000;
const DEFAULT_OTHER_TIMEOUT_MS = 60_000;
const DEFAULT_RESTORE_RETRY_DELAY_MS = 5000;

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Client for LM Studio's native REST API (`/api/v1`). Model switching goes
 * through here; chat traffic uses the OpenAI-compatible `/v1` routes.
 *
 * Every call has a timeout; a caller may also pass `{ signal }` to stop a call
 * earlier (for example on Ctrl-C).
 * @param {{ baseUrl: string; apiToken?: string; fetchImpl?: typeof fetch; timeouts?: { loadMs?: number; otherMs?: number }; restoreRetryDelayMs?: number }} options
 */
export function createLmStudioAdmin({
  baseUrl,
  apiToken,
  fetchImpl = fetch,
  timeouts = {},
  restoreRetryDelayMs = DEFAULT_RESTORE_RETRY_DELAY_MS,
}) {
  const loadTimeoutMs = timeouts.loadMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  const otherTimeoutMs = timeouts.otherMs ?? DEFAULT_OTHER_TIMEOUT_MS;

  /**
   * @param {"GET" | "POST"} method
   * @param {string} path
   * @param {Record<string, unknown> | undefined} body
   * @param {number} timeoutMs
   * @param {AbortSignal} [signal]
   */
  async function call(method, path, body, timeoutMs, signal) {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `LM Studio ${method} ${path} failed: HTTP ${response.status} ${text}`.trim(),
        );
      }
      return text ? JSON.parse(text) : {};
    } catch (err) {
      if (timeout.aborted && !signal?.aborted) {
        throw new Error(
          `LM Studio ${method} ${path} timed out after ${timeoutMs} ms`,
          { cause: err },
        );
      }
      throw err;
    }
  }

  /**
   * @param {CallOptions} [options]
   * @returns {Promise<LmStudioModel[]>}
   */
  async function listModels({ signal } = {}) {
    const payload = await call(
      "GET",
      "/api/v1/models",
      undefined,
      otherTimeoutMs,
      signal,
    );
    return payload.models;
  }

  /**
   * @param {CallOptions} [options]
   * @returns {Promise<LoadedInstance[]>}
   */
  async function loadedLlmInstances(options = {}) {
    const models = await listModels(options);
    return models
      .filter((model) => model.type === "llm")
      .flatMap((model) =>
        model.loaded_instances.map((instance) => {
          const loadConfig = pickLoadConfig(instance.config);
          return {
            modelKey: model.key,
            instanceId: instance.id,
            contextLength:
              typeof loadConfig.context_length === "number"
                ? loadConfig.context_length
                : null,
            loadConfig,
          };
        }),
      );
  }

  /**
   * @param {string} modelKey
   * @param {Record<string, unknown>} [loadConfig]
   * @param {CallOptions} [options]
   */
  async function load(modelKey, loadConfig = {}, { signal } = {}) {
    return call(
      "POST",
      "/api/v1/models/load",
      { model: modelKey, ...loadConfig, echo_load_config: true },
      loadTimeoutMs,
      signal,
    );
  }

  /**
   * @param {string} instanceId
   * @param {CallOptions} [options]
   */
  async function unload(instanceId, { signal } = {}) {
    return call(
      "POST",
      "/api/v1/models/unload",
      { instance_id: instanceId },
      otherTimeoutMs,
      signal,
    );
  }

  /** @param {CallOptions} [options] */
  async function unloadAllLlms(options = {}) {
    for (const instance of await loadedLlmInstances(options)) {
      await unload(instance.instanceId, options);
    }
  }

  /**
   * Returns the server to a snapshot taken with `loadedLlmInstances`. An
   * unload failure throws at once (an empty server is safer than a half
   * state). Each load is retried once, and every instance is attempted before
   * the failures are reported together, so one bad model does not leave the
   * rest of the snapshot unloaded. Afterwards every reloaded instance is read
   * back, and a setting the server did not apply is reported as a failure:
   * a resident model that silently comes back with fewer slots is not restored.
   * @param {LoadedInstance[]} snapshot
   */
  async function restore(snapshot) {
    await unloadAllLlms();
    /** @type {{ modelKey: string; error: unknown }[]} */
    const failures = [];
    for (const instance of snapshot) {
      const loadConfig = snapshotLoadConfig(instance);
      try {
        await load(instance.modelKey, loadConfig);
      } catch {
        await delay(restoreRetryDelayMs);
        try {
          await load(instance.modelKey, loadConfig);
        } catch (err) {
          failures.push({ modelKey: instance.modelKey, error: err });
        }
      }
    }
    const reloaded = await loadedLlmInstances();
    for (const instance of snapshot) {
      if (failures.some((failure) => failure.modelKey === instance.modelKey)) {
        continue;
      }
      const actual = reloaded.find(
        (candidate) => candidate.modelKey === instance.modelKey,
      );
      const differences = Object.entries(snapshotLoadConfig(instance))
        .filter(([key, expected]) => actual?.loadConfig?.[key] !== expected)
        .map(
          ([key, expected]) =>
            `${key}=${String(actual?.loadConfig?.[key])}, snapshot had ${key}=${String(expected)}`,
        );
      if (!actual || differences.length > 0) {
        failures.push({
          modelKey: instance.modelKey,
          error: new Error(
            actual
              ? `${instance.modelKey} loaded with ${differences.join("; ")}`
              : `${instance.modelKey} is not loaded after restore`,
          ),
        });
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.error),
        `restore could not reload ${failures
          .map((failure) => `${failure.modelKey} (${messageOf(failure.error)})`)
          .join("; ")}`,
      );
    }
  }

  /** @param {string} modelRef LM Studio catalog id or Hugging Face URL */
  async function download(modelRef) {
    return call(
      "POST",
      "/api/v1/models/download",
      { model: modelRef },
      otherTimeoutMs,
    );
  }

  return {
    listModels,
    loadedLlmInstances,
    load,
    unload,
    unloadAllLlms,
    restore,
    download,
  };
}
