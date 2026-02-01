import assert from "node:assert";
import { describe, it } from "node:test";

import { pickDocumentPreviewSlot } from "@/lib/admin/document-preview";

void describe("pickDocumentPreviewSlot", () => {
  void it("prefers preview image when available", () => {
    const slot = pickDocumentPreviewSlot({
      previewImageUrl: "https://example.com/cover.png",
      iconEmoji: "✨",
      iconImageUrl: "/favicon.ico",
    });

    assert.strictEqual(slot.type, "previewImage");
    assert.strictEqual(slot.value, "https://example.com/cover.png");
  });

  void it("falls back to the emoji after missing preview image", () => {
    const slot = pickDocumentPreviewSlot({
      iconEmoji: "🚀",
      iconImageUrl: "/favicon.ico",
    });

    assert.strictEqual(slot.type, "notionEmoji");
    assert.strictEqual(slot.value, "🚀");
  });

  void it("uses icon image when emoji is not provided", () => {
    const slot = pickDocumentPreviewSlot({
      iconImageUrl: "/favicon.ico",
    });

    assert.strictEqual(slot.type, "iconImage");
    assert.strictEqual(slot.value, "/favicon.ico");
  });

  void it("returns placeholder when no inputs provided", () => {
    const slot = pickDocumentPreviewSlot({});

    assert.strictEqual(slot.type, "placeholder");
    assert.strictEqual(slot.value, undefined);
  });
});
