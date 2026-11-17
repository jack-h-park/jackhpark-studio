import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { loadCampusScene } from "../components/pm-intelligence-world/three/loadCampusScene";

interface View {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  extensions?: {
    EXT_meshopt_compression?: {
      buffer: number;
      byteOffset: number;
      byteLength: number;
      byteStride: number;
      count: number;
      mode: string;
      filter?: string;
    };
  };
}
interface Document {
  bufferViews: View[];
  buffers: unknown[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  [key: string]: unknown;
}
function readGlb(name: string) {
  const bytes = readFileSync(
    new URL(
      `../public/experiences/pm-intelligence/observatory/${name}`,
      import.meta.url,
    ),
  );
  const jsonLength = bytes.readUInt32LE(12);
  return {
    bytes,
    document: JSON.parse(
      bytes.subarray(20, 20 + jsonLength).toString(),
    ) as Document,
    binary: bytes.subarray(28 + jsonLength),
  };
}

const semantics = (document: Document) => {
  const {
    buffers: _buffers,
    bufferViews: _views,
    extensionsUsed,
    extensionsRequired,
    ...rest
  } = document;
  return {
    ...rest,
    extensionsUsed: extensionsUsed?.filter(
      (x) => x !== "EXT_meshopt_compression",
    ),
    extensionsRequired:
      extensionsRequired?.filter((x) => x !== "EXT_meshopt_compression") ?? [],
  };
};

// Detects rounding, reordered indices, missing authored data, or stale derivatives.
void test("delivery model restores every authored buffer byte and semantic property", async () => {
  const original = readGlb("campus.glb");
  const delivery = readGlb("campus.meshopt.glb");
  await MeshoptDecoder.ready;
  assert.equal(
    delivery.document.bufferViews.length,
    original.document.bufferViews.length,
  );
  for (let i = 0; i < original.document.bufferViews.length; i++) {
    const source = original.document.bufferViews[i];
    const view = delivery.document.bufferViews[i];
    const extension = view.extensions?.EXT_meshopt_compression;
    let restored: Uint8Array;
    if (extension) {
      assert.equal(extension.filter ?? "NONE", "NONE");
      assert.ok(["ATTRIBUTES", "INDICES"].includes(extension.mode));
      restored = new Uint8Array(view.byteLength);
      MeshoptDecoder.decodeGltfBuffer(
        restored,
        extension.count,
        extension.byteStride,
        delivery.binary.subarray(
          extension.byteOffset,
          extension.byteOffset + extension.byteLength,
        ),
        extension.mode,
      );
      const { extensions: _extensions, ...storage } = view;
      assert.deepEqual({ ...storage, buffer: source.buffer }, source);
    } else {
      restored = delivery.binary.subarray(
        view.byteOffset ?? 0,
        (view.byteOffset ?? 0) + view.byteLength,
      );
      assert.deepEqual({ ...view, byteOffset: source.byteOffset }, source);
    }
    assert.deepEqual(
      Buffer.from(restored),
      original.binary.subarray(
        source.byteOffset ?? 0,
        (source.byteOffset ?? 0) + source.byteLength,
      ),
      `view ${i} must be lossless, including indices and texture`,
    );
  }
  assert.deepEqual(semantics(delivery.document), semantics(original.document));
  const compressed = readFileSync(
    new URL(
      "../public/experiences/pm-intelligence/observatory/campus.meshopt.glb.gz",
      import.meta.url,
    ),
  );
  assert.deepEqual(gunzipSync(compressed), delivery.bytes);
  assert.ok(
    compressed.length < 900_000,
    "Exact geometry delivery must save at least 90KB against the previous 992KB path",
  );
});

void test("the live scene loader decodes the delivery extension into real campus meshes", async () => {
  const delivery = readGlb("campus.meshopt.glb");
  // Texture identity is checked above. Omit browser-only image decoding here.
  delete delivery.document.images;
  delete delivery.document.textures;
  for (const material of delivery.document.materials as {
    pbrMetallicRoughness?: { baseColorTexture?: unknown };
  }[]) {
    if (material.pbrMetallicRoughness)
      delete material.pbrMetallicRoughness.baseColorTexture;
  }
  const json = Buffer.from(JSON.stringify(delivery.document));
  const padding = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
  const model = Buffer.alloc(
    28 + json.length + padding.length + delivery.binary.length,
  );
  model.writeUInt32LE(0x46_54_6c_67, 0);
  model.writeUInt32LE(2, 4);
  model.writeUInt32LE(model.length, 8);
  model.writeUInt32LE(json.length + padding.length, 12);
  model.writeUInt32LE(0x4e_4f_53_4a, 16);
  json.copy(model, 20);
  padding.copy(model, 20 + json.length);
  const offset = 20 + json.length + padding.length;
  model.writeUInt32LE(delivery.binary.length, offset);
  model.writeUInt32LE(0x00_4e_49_42, offset + 4);
  delivery.binary.copy(model, offset + 8);
  const scene = await loadCampusScene(
    Promise.resolve(Uint8Array.from(model).buffer),
    () => false,
    () => {},
  );
  assert.equal(scene.scene.children.length, 21);
  for (const child of scene.scene.children) {
    assert.ok(child.name.startsWith("Campus"));
  }
});
