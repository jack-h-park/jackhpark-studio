import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NotionPageImage } from "@/lib/rag/notion-images";
import {
  buildImageChunkText,
  imageChunksActiveFor,
  imageUrlHash,
  shouldCaptionDocType,
} from "@/lib/rag/image-captions";

const image: NotionPageImage = {
  blockId: "block-1",
  url: "https://www.notion.so/image/attachment%3Aabc%3Afig.png?table=block&id=b1",
  notionCaption: "Figure 1",
  nearestHeading: "Retrieval Pipeline",
  precedingText: "The pipeline fans out per chunk.",
  orderIndex: 0,
};

void describe("image-captions helpers", () => {
  void it("imageUrlHash is stable and URL-only", () => {
    const a = imageUrlHash(image.url);
    const b = imageUrlHash(image.url);
    assert.equal(a, b);
    assert.equal(a.length, 64); // sha256 hex
    // Different URL (e.g. re-uploaded attachment) => different key.
    assert.notEqual(a, imageUrlHash(`${image.url}&v=2`));
  });

  void it("shouldCaptionDocType allowlists article types only by default", () => {
    assert.equal(shouldCaptionDocType("project_article"), true);
    assert.equal(shouldCaptionDocType("kb_article"), true);
    assert.equal(shouldCaptionDocType("photo"), false);
    assert.equal(shouldCaptionDocType("profile"), false);
    assert.equal(shouldCaptionDocType(null), false);
    assert.equal(shouldCaptionDocType(undefined), false);
  });

  void it("shouldCaptionDocType honors the env override", () => {
    const previous = process.env.IMAGE_CHUNKS_DOC_TYPES;
    process.env.IMAGE_CHUNKS_DOC_TYPES = "photo";
    try {
      assert.equal(shouldCaptionDocType("photo"), true);
      assert.equal(shouldCaptionDocType("kb_article"), false);
    } finally {
      if (previous === undefined) {
        delete process.env.IMAGE_CHUNKS_DOC_TYPES;
      } else {
        process.env.IMAGE_CHUNKS_DOC_TYPES = previous;
      }
    }
  });

  void it("imageChunksActiveFor gates on flag, images, and doc_type", () => {
    const previous = process.env.IMAGE_CHUNKS_ENABLED;
    try {
      process.env.IMAGE_CHUNKS_ENABLED = "true";
      // Eligible article with images → active.
      assert.equal(
        imageChunksActiveFor({ imageCount: 3, docType: "project_article" }),
        true,
      );
      // Photo gallery with images → NOT active (would otherwise churn the
      // content hash for no captioning benefit).
      assert.equal(
        imageChunksActiveFor({ imageCount: 5, docType: "photo" }),
        false,
      );
      // Article with no images → not active.
      assert.equal(
        imageChunksActiveFor({ imageCount: 0, docType: "kb_article" }),
        false,
      );
      // Flag off → never active, even for eligible docs.
      process.env.IMAGE_CHUNKS_ENABLED = "false";
      assert.equal(
        imageChunksActiveFor({ imageCount: 3, docType: "project_article" }),
        false,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.IMAGE_CHUNKS_ENABLED;
      } else {
        process.env.IMAGE_CHUNKS_ENABLED = previous;
      }
    }
  });

  void it("buildImageChunkText includes marker, caption, and context", () => {
    const text = buildImageChunkText({
      image,
      caption: "A fan-out diagram of the retrieval pipeline.",
      fromCache: false,
    });
    assert.ok(text.startsWith("[Image]\n"));
    assert.ok(text.includes("A fan-out diagram of the retrieval pipeline."));
    assert.ok(text.includes("Section: Retrieval Pipeline"));
    assert.ok(text.includes("Caption: Figure 1"));
  });

  void it("buildImageChunkText omits missing context lines", () => {
    const text = buildImageChunkText({
      image: { ...image, nearestHeading: null, notionCaption: null },
      caption: "A screenshot.",
      fromCache: true,
    });
    assert.equal(text, "[Image]\nA screenshot.");
  });
});
