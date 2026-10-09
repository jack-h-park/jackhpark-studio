import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Approximate used unified memory: wired + active + compressor pages. An MLX
 * model's GPU buffers land in wired memory, so the delta across a model load
 * approximates its resident footprint. It is system-wide, so other processes
 * add noise; the report labels it approximate.
 * @param {string} text output of `vm_stat`
 * @returns {number} bytes
 */
export function parseVmStatUsedBytes(text) {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1]);
  if (!Number.isFinite(pageSize)) {
    throw new Error("vm_stat output has no page size");
  }

  /** @param {string} label */
  const pages = (label) => {
    const match = new RegExp(`${label}:\\s+(\\d+)\\.`).exec(text);
    if (!match) {
      throw new Error(`vm_stat output has no "${label}" line`);
    }

    return Number(match[1]);
  };

  return (
    (pages("Pages wired down") +
      pages("Pages active") +
      pages("Pages occupied by compressor")) *
    pageSize
  );
}

export async function readUsedMemoryBytes() {
  const { stdout } = await execFileAsync("vm_stat");
  return parseVmStatUsedBytes(stdout);
}
