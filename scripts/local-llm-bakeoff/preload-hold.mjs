// scripts/local-llm-bakeoff/preload-hold.mjs
import { readFile, rm, writeFile } from "node:fs/promises";

/**
 * The model host runs a residency loop that reloads its resident model within
 * a minute of an unload, unless a hold file names an expiry (epoch seconds) on
 * its first line. Without the hold, the resident model comes back next to the
 * candidate being measured, and the restore can end with two copies of it.
 * @param {string} path
 */
async function readHoldExpiry(path) {
  try {
    const first = (await readFile(path, "utf8")).split("\n")[0]?.trim() ?? "";
    return /^\d+$/.test(first) ? Number(first) : null;
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Writes a hold that expires `seconds` from now, unless one already runs
 * longer; that one is someone else's, so it is neither shortened nor removed.
 * The returned release removes only a hold this call wrote and nobody has
 * rewritten since.
 * @param {string} path
 * @param {number} seconds
 * @param {() => number} [nowMs]
 * @returns {Promise<{ expiry: number; owned: boolean; release: () => Promise<void> }>}
 */
export async function acquirePreloadHold(path, seconds, nowMs = Date.now) {
  const expiry = Math.floor(nowMs() / 1000) + seconds;
  const existing = await readHoldExpiry(path);
  if (existing !== null && existing >= expiry) {
    // Not ours to remove.
    return { expiry: existing, owned: false, release: () => Promise.resolve() };
  }
  await writeFile(path, `${expiry}\n`);
  return {
    expiry,
    owned: true,
    release: async () => {
      if ((await readHoldExpiry(path)) === expiry) {
        await rm(path, { force: true });
      }
    },
  };
}
