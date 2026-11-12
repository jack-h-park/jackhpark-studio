import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export async function validateAssets(bundle, publicRoot) {
  assert.equal(bundle.version, 1);
  assert.ok(Array.isArray(bundle.assets));
  const root = await realpath(publicRoot);
  const ids = new Set();
  let bytes = 0;
  for (const asset of bundle.assets) {
    assert.ok(
      typeof asset.id === "string" && asset.id && !ids.has(asset.id),
      "Unique asset identifier required",
    );
    ids.add(asset.id);
    assert.equal(
      asset.reviewStatus,
      "accepted",
      "Only accepted assets may be published",
    );
    assert.ok(asset.kind === "image" || asset.kind === "model");
    assert.ok(
      /^\/experiences\/pm-intelligence\/[a-z0-9/_-]+\.(?:glb(?:\.gz)?|webp|png|jpg)$/.test(
        asset.url,
      ),
      "Invalid public asset path",
    );
    const filename = await realpath(path.join(root, asset.url));
    assert.ok(
      !path.relative(root, filename).startsWith(".."),
      "Asset must stay inside public root",
    );
    const data = await readFile(filename);
    assert.equal(data.length, asset.bytes, "Byte count mismatch");
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      asset.sha256,
      "Hash mismatch",
    );
    bytes += data.length;
  }
  assert.ok(bytes <= 8 * 1024 * 1024, "Optional asset budget exceeds 8 MiB");
  return { count: ids.size, bytes };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = JSON.parse(
    await readFile("content/pm-intelligence-world/assets.json", "utf8"),
  );
  const result = await validateAssets(manifest, path.resolve("public"));
  process.stdout.write(
    `PM Intelligence assets: ${result.count} accepted assets, ${result.bytes} bytes. Procedural geometry requires no downloaded model.\n`,
  );
}
