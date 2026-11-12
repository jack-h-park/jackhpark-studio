import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  BufferGeometry,
  type Camera,
  Float32BufferAttribute,
  Mesh,
  OrthographicCamera,
  Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";

type Compiler = Pick<
  WebGLRenderer,
  "compileAsync" | "getRenderTarget" | "setRenderTarget"
>;

export async function prepareObservatoryFrame(
  renderer: Compiler,
  scene: Scene,
  camera: Camera,
  target: WebGLRenderTarget,
  bloom: UnrealBloomPass,
): Promise<void> {
  // Match Pass.js's fullscreen triangle, without accessing private pass meshes.
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3),
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2),
  );
  const effects = new Scene();
  for (const material of [
    bloom.materialHighPassFilter,
    ...bloom.separableBlurMaterials,
    bloom.compositeMaterial,
    bloom.blendMaterial,
  ]) {
    effects.add(new Mesh(geometry, material));
  }
  const previous = renderer.getRenderTarget();
  try {
    let pending: Promise<unknown>;
    try {
      // Compiling for the screen would warm different tone/color-space variants
      // from the offscreen RenderPass and bloom passes used on the first frame.
      renderer.setRenderTarget(target);
      pending = Promise.all([
        renderer.compileAsync(scene, camera),
        renderer.compileAsync(
          effects,
          new OrthographicCamera(-1, 1, 1, -1, 0, 1),
        ),
      ]);
    } finally {
      renderer.setRenderTarget(previous);
    }
    await pending;
  } finally {
    // The live passes own the shared materials; only this geometry is temporary.
    geometry.dispose();
  }
}
