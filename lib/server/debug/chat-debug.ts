export function isChatDebugEnabled(): boolean {
  return process.env.CHAT_DEBUG === "1";
}
