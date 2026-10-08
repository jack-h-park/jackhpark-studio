// scripts/local-llm-bakeoff/private-path.mjs
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Real visitor questions must never land in this public repository.
 * @param {string} target
 * @param {string} repoRoot
 */
export function assertOutsideRepo(target, repoRoot) {
  const rel = relative(resolve(repoRoot), resolve(target));
  const outside = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (!outside) {
    throw new Error(
      `${target} is inside the repository; private evaluation data must live outside it`,
    );
  }
}
