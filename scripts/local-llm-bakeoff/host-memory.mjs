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
  const { pageSize, pages } = vmStatPages(text);
  return (
    (pages("Pages wired down") +
      pages("Pages active") +
      pages("Pages occupied by compressor")) *
    pageSize
  );
}

/**
 * Free + inactive pages: memory the system can hand out without swapping.
 * This is the figure the host's experiment stop rule is written against.
 * @param {string} text output of `vm_stat`
 * @returns {number} bytes
 */
export function parseVmStatFreeInactiveBytes(text) {
  const { pageSize, pages } = vmStatPages(text);
  return (pages("Pages free") + pages("Pages inactive")) * pageSize;
}

/** @param {string} text */
function vmStatPages(text) {
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

  return { pageSize, pages };
}

const SWAP_UNITS = { K: 1024, M: 1024 ** 2, G: 1024 ** 3 };

/**
 * @param {string} text output of `sysctl vm.swapusage`, e.g.
 *   "vm.swapusage: total = 5120.00M  used = 3800.94M  free = 1319.06M  (encrypted)"
 * @returns {number} bytes
 */
export function parseSwapUsedBytes(text) {
  const match = /used = ([\d.]+)([KMG])/.exec(text);
  if (!match) {
    throw new Error("vm.swapusage output has no used figure");
  }
  const unit = /** @type {"K" | "M" | "G"} */ (match[2]);
  return Number(match[1]) * SWAP_UNITS[unit];
}

export async function readUsedMemoryBytes() {
  const { stdout } = await execFileAsync("vm_stat");
  return parseVmStatUsedBytes(stdout);
}

/** @returns {Promise<{ freeInactiveBytes: number; swapUsedBytes: number }>} */
export async function readMemoryHeadroom() {
  const [vmStat, swap] = await Promise.all([
    execFileAsync("vm_stat"),
    execFileAsync("/usr/sbin/sysctl", ["vm.swapusage"]),
  ]);
  return {
    freeInactiveBytes: parseVmStatFreeInactiveBytes(vmStat.stdout),
    swapUsedBytes: parseSwapUsedBytes(swap.stdout),
  };
}
