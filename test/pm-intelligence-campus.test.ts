import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface CampusDocument {
  meshes: {
    primitives: { attributes: Record<string, number>; material: number }[];
  }[];
  materials: {
    pbrMetallicRoughness?: { baseColorTexture?: { index: number } };
  }[];
}

void test("campus keeps paving texture coordinates without uploading unused UVs", () => {
  const bytes = readFileSync(
    new URL(
      "../public/experiences/pm-intelligence/observatory/campus.glb",
      import.meta.url,
    ),
  );
  const document = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  ) as CampusDocument;
  let textured = 0;
  let solid = 0;
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives) {
      assert.ok("POSITION" in primitive.attributes);
      assert.ok("NORMAL" in primitive.attributes);
      if (
        document.materials[primitive.material].pbrMetallicRoughness
          ?.baseColorTexture
      ) {
        textured++;
        assert.ok("TEXCOORD_0" in primitive.attributes);
      } else {
        solid++;
        assert.equal("TEXCOORD_0" in primitive.attributes, false);
      }
    }
  }
  assert.ok(textured > 0, "The authored paving texture must remain");
  assert.ok(solid > 0, "The solid-color campus geometry must remain");
});
