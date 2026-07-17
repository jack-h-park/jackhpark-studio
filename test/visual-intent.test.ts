import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasVisualIntent,
  imageChunkVisualBoost,
  imageUrlForChunk,
  isImageChunk,
} from "@/lib/shared/visual-intent";

const imageChunkMeta = {
  chunk_hash: "12345",
  image_chunks: {
    "12345": {
      image_url: "https://www.notion.so/image/attachment%3Aabc.png",
      block_id: "b1",
      order_index: 0,
    },
  },
};

void describe("visual-intent helpers", () => {
  void it("detects English and Korean visual keywords", () => {
    assert.equal(hasVisualIntent("please show me visually how it looks"), true);
    assert.equal(hasVisualIntent("아키텍처 다이어그램 보여줘"), true);
    assert.equal(hasVisualIntent("스크린샷 있어?"), true);
    assert.equal(hasVisualIntent("What are Jack's most impactful projects?"), false);
    assert.equal(hasVisualIntent(null), false);
    assert.equal(hasVisualIntent(""), false);
  });

  void it("identifies image chunks via image_chunks map or text prefix", () => {
    assert.equal(isImageChunk("regular prose", imageChunkMeta), true);
    assert.equal(
      isImageChunk("[Image]\nA fan-out diagram.", { chunk_hash: "other" }),
      true,
    );
    assert.equal(isImageChunk("regular prose", { chunk_hash: "other" }), false);
    assert.equal(isImageChunk(null, null), false);
  });

  void it("resolves the exact image URL for a chunk", () => {
    assert.equal(
      imageUrlForChunk(imageChunkMeta),
      "https://www.notion.so/image/attachment%3Aabc.png",
    );
    assert.equal(imageUrlForChunk({ chunk_hash: "missing" }), null);
    assert.equal(imageUrlForChunk(null), null);
  });

  void it("visual boost defaults to 1.3 and rejects invalid overrides", () => {
    const previous = process.env.IMAGE_CHUNK_VISUAL_BOOST;
    try {
      delete process.env.IMAGE_CHUNK_VISUAL_BOOST;
      assert.equal(imageChunkVisualBoost(), 1.3);
      process.env.IMAGE_CHUNK_VISUAL_BOOST = "2";
      assert.equal(imageChunkVisualBoost(), 2);
      process.env.IMAGE_CHUNK_VISUAL_BOOST = "-1";
      assert.equal(imageChunkVisualBoost(), 1.3);
    } finally {
      if (previous === undefined) {
        delete process.env.IMAGE_CHUNK_VISUAL_BOOST;
      } else {
        process.env.IMAGE_CHUNK_VISUAL_BOOST = previous;
      }
    }
  });
});
