// scripts/local-llm-bakeoff/preload-hold.mjs
import { readFile, rm, writeFile } from "node:fs/promises";

// The host's residency loop reads only the first line (the expiry), so the
// second line can say whose hold it is.
const OWNER = "local-llm-bakeoff";

/**
 * The model host runs a residency loop that reloads its resident model within
 * a minute of an unload, unless a hold file names an expiry (epoch seconds) on
 * its first line. Without the hold, the resident model comes back next to the
 * candidate being measured, and the restore can end with two copies of it.
 * @param {string} path
 * @returns {Promise<{ expiry: number | null; ours: boolean } | null>} null when there is no file
 */
async function readHold(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
  const [first = "", second = ""] = text.split("\n");
  return {
    expiry: /^\d+$/.test(first.trim()) ? Number(first.trim()) : null,
    ours: second.trim() === OWNER,
  };
}

/**
 * Writes a hold that expires `seconds` from now. An unexpired hold that is not
 * the bake-off's own means another experiment holds the model server (one
 * renews a short hold every few seconds while it runs), so the run must not
 * start: replacing that hold, or removing it afterwards, would hand the
 * server back to the residency loop in the middle of that experiment. A hold
 * the bake-off left itself, from a run killed before its release, is taken
 * over. The returned release removes only a hold this call wrote and nobody
 * has rewritten since.
 * @param {string} path
 * @param {number} seconds
 * @param {() => number} [nowMs]
 * @returns {Promise<{ expiry: number; release: () => Promise<void> }>}
 */
export async function acquirePreloadHold(path, seconds, nowMs = Date.now) {
  const now = Math.floor(nowMs() / 1000);
  const existing = await readHold(path);
  if (existing?.expiry != null && existing.expiry > now && !existing.ours) {
    throw new Error(
      `another preload hold is active until ${new Date(existing.expiry * 1000).toISOString()} (${path}); not starting`,
    );
  }
  const expiry = now + seconds;
  await writeFile(path, `${expiry}\n${OWNER}\n`);
  return {
    expiry,
    release: async () => {
      const current = await readHold(path);
      if (current?.ours && current.expiry === expiry) {
        await rm(path, { force: true });
      }
    },
  };
}

/**
 * Removes the hold file only when the bake-off wrote it, for a manual restore
 * after a run that was killed before it could release its own hold.
 * @param {string} path
 */
export async function clearOwnPreloadHold(path) {
  if ((await readHold(path))?.ours) {
    await rm(path, { force: true });
  }
}
