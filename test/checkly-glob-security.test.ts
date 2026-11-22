import type { Readable } from "node:stream";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";

const require = createRequire(import.meta.url);
const checklyRequire = createRequire(require.resolve("checkly"));
interface GlobOptions {
  cwd: string;
  signal: AbortSignal;
  fs: typeof fs;
}
const { glob, globStream } = checklyRequire("glob") as {
  glob(pattern: string, options: GlobOptions): Promise<string[]>;
  globStream(pattern: string, options: GlobOptions): Readable;
};

for (const mode of ["promise", "stream"] as const) {
  void test(`Checkly's glob ${mode} stops directory traversal after cancellation`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "glob-abort-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    async function tree(directory: string, depth: number): Promise<void> {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "fixture.txt"), "fixture");
      if (depth > 0) {
        await tree(path.join(directory, "a"), depth - 1);
        await tree(path.join(directory, "b"), depth - 1);
      }
    }
    await tree(root, 4);
    const controller = new AbortController();
    let reads = 0;
    const readdir = ((...args: Parameters<typeof fs.readdir>) => {
      reads++;
      if (reads === 1) controller.abort(new Error("fixture cancellation"));
      return fs.readdir(...args);
    }) as typeof fs.readdir;
    const options = {
      cwd: root,
      signal: controller.signal,
      fs: { ...fs, readdir },
    };
    const completion =
      mode === "promise"
        ? glob("**", options)
        : new Promise<void>((resolve, reject) => {
            globStream("**", options)
              .on("error", reject)
              .on("end", resolve)
              .resume();
          });
    await assert.rejects(completion, /fixture cancellation/);
    // Rejection alone hid continued traversal in the vulnerable dependency.
    // Keep the tree bounded and allow outstanding filesystem callbacks to run.
    await setTimeout(150);
    assert.equal(reads, 1, "cancelled glob kept reading child directories");
  });
}
