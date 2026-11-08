import assert from "node:assert/strict";
import test from "node:test";

import { Box3, OrthographicCamera, Vector3 } from "three";

import { createDestinationExhibits } from "../components/pm-intelligence-world/three/observatoryExhibits";
import {
  clearPlayfield,
  fitObjectFrame,
  observatoryZoomLimits,
} from "../lib/pm-intelligence-world/observatory-framing";

void test("every instrument fits in the actual clear playfield across portrait, desktop and short landscape", () => {
  const exhibits = createDestinationExhibits();
  for (const [width, height] of [
    [320, 844],
    [390, 844],
    [1280, 800],
    [568, 320],
    [844, 390],
  ]) {
    const aspect = width / height;
    const span = aspect < 1 ? 28 : Math.max(36, aspect * 24.5);
    for (const view of exhibits.views) {
      const camera = new OrthographicCamera(
        -span / 2,
        span / 2,
        span / aspect / 2,
        -span / aspect / 2,
        0.1,
        180,
      );
      camera.position.set(23, 25, 36);
      camera.lookAt(0, 2.6, 1.2);
      camera.updateMatrixWorld();
      const side = width > 600 || width > height;
      const panel = side
        ? {
            left: width - Math.min(340, width * 0.44) - 16,
            top: 100,
            right: width - 16,
            bottom: height - 24,
          }
        : {
            left: 16,
            top: height * 0.62 - 24,
            right: width - 16,
            bottom: height - 24,
          };
      const bounds = new Box3().setFromObject(view.root);
      const frame = fitObjectFrame(camera, bounds, { width, height }, [
        { left: 16, top: 22, right: width - 16, bottom: 76 },
        panel,
      ]);
      const oldTarget = new Vector3(0, 2.6, 1.2);
      camera.position.add(frame.target.clone().sub(oldTarget));
      camera.lookAt(frame.target);
      camera.zoom = Math.min(frame.zoom, observatoryZoomLimits.max);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const projected = new Vector3(x, y, z).project(camera);
            const px = ((projected.x + 1) * width) / 2,
              py = ((1 - projected.y) * height) / 2;
            assert.ok(
              px >= frame.playfield.left &&
                px <= frame.playfield.right &&
                py >= frame.playfield.top &&
                py <= frame.playfield.bottom,
              `${view.destination} ${width}x${height} clips at ${px},${py}`,
            );
          }
      const center = bounds.getCenter(new Vector3()).project(camera);
      assert.ok(
        Math.abs(
          ((center.x + 1) * width) / 2 -
            (frame.playfield.left + frame.playfield.right) / 2,
        ) < 0.01,
      );
      assert.ok(
        Math.abs(
          ((1 - center.y) * height) / 2 -
            (frame.playfield.top + frame.playfield.bottom) / 2,
        ) < 0.01,
      );
      assert.ok(frame.zoom > 1);
    }
  }
});

void test("occluders outside the viewport do not shrink the playfield", () => {
  assert.deepEqual(
    clearPlayfield({ width: 390, height: 844 }, [
      { left: 500, top: 0, right: 800, bottom: 844 },
    ]),
    clearPlayfield({ width: 390, height: 844 }, []),
  );
});

void test("manual orbit owns the camera until explicit selection, and captured gestures defer a resize", async () => {
  const framing =
    await import("../lib/pm-intelligence-world/observatory-framing");
  assert.equal(typeof framing.CameraFramingGate, "function");
  const gate = new framing.CameraFramingGate();
  gate.select();
  assert.equal(gate.request(), true);
  gate.orbit();
  assert.equal(
    gate.request(),
    false,
    "panel edits cannot replace a manually chosen angle",
  );
  assert.equal(
    gate.request(),
    false,
    "header resizes cannot replace a manually chosen angle",
  );
  gate.select();
  gate.begin();
  assert.equal(gate.request(), false, "resize must wait for pointer release");
  assert.equal(gate.end(), true, "the deferred framing is delivered once");
  assert.equal(gate.end(), false);
  gate.begin();
  gate.request();
  gate.orbit();
  assert.equal(
    gate.end(),
    false,
    "a deferred request cannot steal manual ownership",
  );
});
