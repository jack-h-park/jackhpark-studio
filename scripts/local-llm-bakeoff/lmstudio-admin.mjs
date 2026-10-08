/**
 * @typedef {{ modelKey: string; instanceId: string; contextLength: number | null }} LoadedInstance
 * @typedef {{ key: string; type: string; loaded_instances: { id: string; config?: { context_length?: number | null } }[] }} LmStudioModel
 */

/**
 * Client for LM Studio's native REST API (`/api/v1`). Model switching goes
 * through here; chat traffic uses the OpenAI-compatible `/v1` routes.
 * @param {{ baseUrl: string; apiToken?: string; fetchImpl?: typeof fetch }} options
 */
export function createLmStudioAdmin({ baseUrl, apiToken, fetchImpl = fetch }) {
  /**
   * @param {"GET" | "POST"} method
   * @param {string} path
   * @param {Record<string, unknown>} [body]
   */
  async function call(method, path, body) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `LM Studio ${method} ${path} failed: HTTP ${response.status} ${text}`.trim(),
      );
    }
    return text ? JSON.parse(text) : {};
  }

  /** @returns {Promise<LmStudioModel[]>} */
  async function listModels() {
    const payload = await call("GET", "/api/v1/models");
    return payload.models;
  }

  /** @returns {Promise<LoadedInstance[]>} */
  async function loadedLlmInstances() {
    const models = await listModels();
    return models
      .filter((model) => model.type === "llm")
      .flatMap((model) =>
        model.loaded_instances.map((instance) => ({
          modelKey: model.key,
          instanceId: instance.id,
          contextLength: instance.config?.context_length ?? null,
        })),
      );
  }

  /**
   * @param {string} modelKey
   * @param {Record<string, unknown>} [loadConfig]
   */
  async function load(modelKey, loadConfig = {}) {
    return call("POST", "/api/v1/models/load", {
      model: modelKey,
      ...loadConfig,
      echo_load_config: true,
    });
  }

  /** @param {string} instanceId */
  async function unload(instanceId) {
    return call("POST", "/api/v1/models/unload", { instance_id: instanceId });
  }

  async function unloadAllLlms() {
    for (const instance of await loadedLlmInstances()) {
      await unload(instance.instanceId);
    }
  }

  /**
   * Returns the server to a snapshot taken with `loadedLlmInstances`.
   * @param {LoadedInstance[]} snapshot
   */
  async function restore(snapshot) {
    await unloadAllLlms();
    for (const instance of snapshot) {
      await load(
        instance.modelKey,
        instance.contextLength === null
          ? {}
          : { context_length: instance.contextLength },
      );
    }
  }

  /** @param {string} modelRef LM Studio catalog id or Hugging Face URL */
  async function download(modelRef) {
    return call("POST", "/api/v1/models/download", { model: modelRef });
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
