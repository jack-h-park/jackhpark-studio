/** Lossless delivery derivative. Run after build-observatory.py.
 * No quantization, reordering, filters or material/texture edits.
 * The canonical GLB and its gzip fallback remain untouched.
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { MeshoptEncoder } from "meshoptimizer/encoder";

const model = new URL(
  "../../public/experiences/pm-intelligence/observatory/campus.glb",
  import.meta.url,
);
const source = await readFile(model);
const jsonLength = source.readUInt32LE(12);
const document = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
const binary = source.subarray(28 + jsonLength);
const parts = [];
let offset = 0;
function append(bytes) {
  const start = offset;
  parts.push(bytes);
  offset += bytes.length;
  const padding = (4 - (offset % 4)) % 4;
  if (padding) {
    parts.push(Buffer.alloc(padding));
    offset += padding;
  }
  return start;
}
await MeshoptEncoder.ready;
for (const view of document.bufferViews) {
  assert.equal(
    view.buffer,
    0,
    "Authoring output must be a single embedded buffer",
  );
  const bytes = binary.subarray(
    view.byteOffset ?? 0,
    (view.byteOffset ?? 0) + view.byteLength,
  );
  if (view.target === 34962 || view.target === 34963) {
    const index = view.target === 34963;
    const stride = index ? 2 : view.byteStride;
    assert.ok(stride && view.byteLength % stride === 0);
    const mode = index ? "INDICES" : "ATTRIBUTES";
    const count = view.byteLength / stride;
    const compressed = MeshoptEncoder.encodeGltfBuffer(
      bytes,
      count,
      stride,
      mode,
      0,
    );
    view.buffer = 1;
    view.extensions = {
      ...view.extensions,
      EXT_meshopt_compression: {
        buffer: 0,
        byteOffset: append(compressed),
        byteLength: compressed.length,
        byteStride: stride,
        count,
        mode,
        filter: "NONE",
      },
    };
  } else {
    view.byteOffset = append(bytes);
  }
}
document.buffers = [
  { byteLength: offset },
  {
    byteLength: binary.length,
    extensions: { EXT_meshopt_compression: { fallback: true } },
  },
];
document.extensionsUsed = [
  ...(document.extensionsUsed ?? []),
  "EXT_meshopt_compression",
];
document.extensionsRequired = [
  ...(document.extensionsRequired ?? []),
  "EXT_meshopt_compression",
];
const json = Buffer.from(JSON.stringify(document));
const jsonPadding = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
const output = Buffer.alloc(28 + json.length + jsonPadding.length + offset);
output.writeUInt32LE(0x46546c67, 0);
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(json.length + jsonPadding.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
json.copy(output, 20);
jsonPadding.copy(output, 20 + json.length);
const chunk = 20 + json.length + jsonPadding.length;
output.writeUInt32LE(offset, chunk);
output.writeUInt32LE(0x004e4942, chunk + 4);
Buffer.concat(parts).copy(output, chunk + 8);
const destination = new URL("campus.meshopt.glb", model);
await writeFile(destination, output);
const gzip = gzipSync(output, { level: 9, mtime: 0 });
await writeFile(new URL("campus.meshopt.glb.gz", model), gzip);
console.log(
  `${fileURLToPath(destination)}: ${output.length} bytes; gzip ${gzip.length} bytes`,
);
