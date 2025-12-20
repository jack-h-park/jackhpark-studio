import { SYSTEM_SETTINGS_TABLE } from "../lib/chat-prompts";
import { ADMIN_CHAT_CONFIG_KEY } from "../lib/server/admin-chat-config";
import { getSupabaseAdminClient } from "../lib/supabase-admin";

try {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SYSTEM_SETTINGS_TABLE)
    .select("value")
    .eq("key", ADMIN_CHAT_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    console.log("No config found in database. Using defaults.");
  } else {
    const config =
      typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    console.log("--- Current Base System Prompt ---");
    console.log(
      config.baseSystemPrompt ||
        "(Empty, falling back to DEFAULT_SYSTEM_PROMPT)",
    );
    console.log("----------------------------------");
  }
} catch (err) {
  console.error("Error fetching config:", err);
  throw err;
}
