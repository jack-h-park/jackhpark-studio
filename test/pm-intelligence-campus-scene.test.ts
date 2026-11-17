import assert from "node:assert/strict";
import test from "node:test";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { loadCampusScene } from "../components/pm-intelligence-world/three/loadCampusScene";

void test("a disposed scene skips parsing a shared download while its live replacement loads normally", async (t) => {
  let resolve!: (data: ArrayBuffer) => void;
  const download = new Promise<ArrayBuffer>((done) => {
    resolve = done;
  });
  let disposed = false;
  let loaded = 0;
  const parse = GLTFLoader.prototype.parseAsync;
  let parses = 0;
  t.mock.method(
    GLTFLoader.prototype,
    "parseAsync",
    function (this: GLTFLoader, ...args: Parameters<GLTFLoader["parseAsync"]>) {
      parses++;
      return parse.apply(this, args);
    },
  );
  const obsolete = loadCampusScene(
    download,
    () => disposed,
    () => loaded++,
  );
  const replacement = loadCampusScene(
    download,
    () => false,
    () => loaded++,
  );
  disposed = true;
  const result = Promise.allSettled([obsolete, replacement]);
  resolve(
    new TextEncoder().encode(
      '{"asset":{"version":"2.0"},"scenes":[{"nodes":[]}],"scene":0,"nodes":[]}',
    ).buffer,
  );
  const [old, current] = await result;
  assert.equal(old.status, "rejected");
  if (old.status === "rejected") assert.equal(old.reason.name, "AbortError");
  assert.equal(current.status, "fulfilled");
  if (current.status === "fulfilled")
    assert.equal(current.value.scene.children.length, 0);
  assert.equal(parses, 1, "Only the live renderer may parse the model");
  assert.equal(
    loaded,
    1,
    "An obsolete renderer must not announce model readiness",
  );
});
