import { getAdminChatConfig } from "@/lib/server/admin-chat-config";

try {
  const config = await getAdminChatConfig();
  console.log("adminConfig loaded", {
    presetCount: Object.keys(config.presets).length,
  });
} catch (err) {
  console.error(err);
  throw err;
}
