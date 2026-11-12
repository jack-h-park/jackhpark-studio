import assert from "node:assert/strict";
import test from "node:test";

import {
  type Mesh,
  type Object3D,
  OrthographicCamera,
  Scene,
  Vector2,
  WebGLRenderTarget,
} from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { prepareObservatoryFrame } from "../components/pm-intelligence-world/three/prepareObservatoryFrame";

void test("preparation warms the offscreen scene and bloom before readiness without owning their materials", async () => {
  const scene = new Scene();
  const camera = new OrthographicCamera();
  const target = new WebGLRenderTarget(16, 16);
  const bloom = new UnrealBloomPass(new Vector2(16, 16), 0.23, 0.4, 1.1);
  let current: WebGLRenderTarget | null = null;
  const compiled: { object: Object3D; target: WebGLRenderTarget | null }[] = [];
  const finish: (() => void)[] = [];
  let materialDisposed = false;
  bloom.compositeMaterial.addEventListener("dispose", () => {
    materialDisposed = true;
  });
  const pending = prepareObservatoryFrame(
    {
      getRenderTarget: () => current,
      setRenderTarget: (value) => {
        current = value;
      },
      compileAsync: (object) => {
        compiled.push({ object, target: current });
        return new Promise<Object3D>((resolve) =>
          finish.push(() => resolve(object)),
        );
      },
    },
    scene,
    camera,
    target,
    bloom,
  );
  try {
    assert.equal(
      compiled[0].target,
      target,
      "Scene shader variants must match the composer's offscreen target",
    );
    assert.equal(
      compiled.length,
      2,
      "Bloom shaders must not wait for the first draw",
    );
    assert.equal(
      current,
      null,
      "Restore render state before awaiting compilation",
    );
    const effects = compiled[1].object;
    const materials = new Set(
      effects.children.map((object) => (object as Mesh).material),
    );
    assert.ok(materials.has(bloom.materialHighPassFilter));
    for (const material of bloom.separableBlurMaterials)
      assert.ok(materials.has(material));
    assert.ok(materials.has(bloom.compositeMaterial));
    assert.ok(materials.has(bloom.blendMaterial));
    let ready = false;
    void pending.then(() => {
      ready = true;
    });
    finish[0]();
    await Promise.resolve();
    assert.equal(
      ready,
      false,
      "Do not announce readiness while bloom is pending",
    );
    finish[1]();
    await pending;
    assert.equal(materialDisposed, false);
  } finally {
    for (const resolve of finish) resolve();
    await pending;
    bloom.dispose();
    target.dispose();
  }
});

void test("a preparation failure restores the caller target and rejects for fallback", async () => {
  const target = new WebGLRenderTarget(16, 16);
  const previous = new WebGLRenderTarget(8, 8);
  const bloom = new UnrealBloomPass(new Vector2(16, 16), 0.23, 0.4, 1.1);
  let current: WebGLRenderTarget | null = previous;
  try {
    await assert.rejects(
      prepareObservatoryFrame(
        {
          getRenderTarget: () => current,
          setRenderTarget: (value) => {
            current = value;
          },
          compileAsync: () => {
            throw new Error("Compilation unavailable");
          },
        },
        new Scene(),
        new OrthographicCamera(),
        target,
        bloom,
      ),
      /Compilation unavailable/,
    );
    assert.equal(current, previous);
  } finally {
    bloom.dispose();
    target.dispose();
    previous.dispose();
  }
});
