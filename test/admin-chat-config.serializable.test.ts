import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSerializableProps } from "next/dist/lib/is-serializable-props";

import { loadAdminChatConfig } from "@/lib/server/admin-chat-config";
import { buildPresetModelResolutions } from "@/lib/server/model-resolution";

import { chatConfigFixture } from "./helpers/public-chat-fixtures";

// Stands in for the one Supabase query loadAdminChatConfig makes:
// system_settings.select().eq().maybeSingle().
function fakeClient(value: unknown): SupabaseClient {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: { value, updated_at: null },
      error: null,
    }),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

void test("a loaded config is serializable as getServerSideProps props", async () => {
  // A stored row whose presets set no reasoning-effort override, which is
  // what every row written before per-preset efforts existed looks like.
  const stored = chatConfigFixture();
  for (const preset of Object.values(stored.presets)) {
    delete preset.reasoningEffort;
  }

  const adminConfig = await loadAdminChatConfig({
    client: fakeClient(stored),
    forceRefresh: true,
  });

  // Next.js runs this check on getServerSideProps output in development and
  // throws on any `undefined` value; /admin/chat-config passes exactly these.
  assert.equal(
    isSerializableProps("/admin/chat-config", "getServerSideProps", {
      adminConfig,
      presetResolutions: buildPresetModelResolutions(adminConfig),
    }),
    true,
  );
});

void test("an unset preset override is omitted, not stored as undefined", async () => {
  const stored = chatConfigFixture();
  delete stored.presets.default.reasoningEffort;
  stored.presets.fast.reasoningEffort = "none";

  const config = await loadAdminChatConfig({
    client: fakeClient(stored),
    forceRefresh: true,
  });

  assert.equal("reasoningEffort" in config.presets.default, false);
  assert.equal(config.presets.fast.reasoningEffort, "none");
});
