import assert from "node:assert/strict";
import test from "node:test";

import { resolveEmbeddingSpace } from "@/lib/core/embedding-spaces";
import {
  enforceEmbeddingProviderAvailability,
  type EmbeddingProviderAvailability,
} from "@/lib/server/telemetry/embedding-trace";

void test("enforceEmbeddingProviderAvailability flags provider_disabled instead of fallback", () => {
  const geminiSpace = resolveEmbeddingSpace({ provider: "gemini" });
  const openAiSpace = resolveEmbeddingSpace({ provider: "openai" });
  const availability: EmbeddingProviderAvailability = {
    openaiEnabled: true,
    geminiEnabled: false,
    missingOpenaiKey: false,
    missingGeminiKey: true,
  };

  const result = enforceEmbeddingProviderAvailability(
    geminiSpace,
    availability,
    (provider) => (provider === "openai" ? openAiSpace : null),
  );

  assert.equal(result.reason, "provider_disabled");
  assert.equal(result.selection.provider, "openai");
  assert.equal(result.fallbackFrom?.provider, "gemini");
});
