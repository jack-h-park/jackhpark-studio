import { appendFile, readFile } from "node:fs/promises";

/**
 * @typedef {{ variant: string; pass: string; itemId: string; rep: number }} RowIdentity
 */

/** @param {RowIdentity} row */
export function rowKey(row) {
  return [row.variant, row.pass, row.itemId, String(row.rep)].join("|");
}

/** @param {string} path */
async function readIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

/**
 * Append-only JSONL store. Reopening it skips rows already written, which is
 * what makes an interrupted overnight run resumable.
 * @param {string} path
 */
export async function openResultsStore(path) {
  const existing = await readIfExists(path);
  /** @type {Set<string>} */
  const keys = new Set();
  for (const line of existing.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    try {
      keys.add(rowKey(JSON.parse(line)));
    } catch {
      // A crash can leave a partial final line; that row is simply redone.
    }
  }

  if (existing.length > 0 && !existing.endsWith("\n")) {
    await appendFile(path, "\n");
  }

  return {
    /** @param {RowIdentity} row */
    has: (row) => keys.has(rowKey(row)),
    /** @param {RowIdentity & Record<string, unknown>} row */
    async append(row) {
      await appendFile(path, `${JSON.stringify(row)}\n`);
      keys.add(rowKey(row));
    },
  };
}

/**
 * @param {string} path
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}
