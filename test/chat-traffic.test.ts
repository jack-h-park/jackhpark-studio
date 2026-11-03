import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyChatTraffic } from "@/lib/server/api/chat-traffic";

void describe("classifyChatTraffic", () => {
  void it("is synthetic only when the header matches the configured token", () => {
    assert.equal(
      classifyChatTraffic("probe-token", "probe-token"),
      "synthetic",
    );
    assert.equal(
      classifyChatTraffic(" probe-token ", "probe-token\n"),
      "synthetic",
    );
  });

  void it("treats a wrong or missing header as a visitor", () => {
    assert.equal(classifyChatTraffic("guess", "probe-token"), "visitor");
    assert.equal(classifyChatTraffic("", "probe-token"), "visitor");
    assert.equal(classifyChatTraffic(null, "probe-token"), "visitor");
    assert.equal(classifyChatTraffic(undefined, "probe-token"), "visitor");
  });

  void it("never classifies synthetic when no token is configured", () => {
    assert.equal(classifyChatTraffic("anything", undefined), "visitor");
    assert.equal(classifyChatTraffic("", ""), "visitor");
    assert.equal(classifyChatTraffic("  ", "  "), "visitor");
  });
});
