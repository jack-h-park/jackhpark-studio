export function register() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("[langchain_chat_impl] instrumentation registered");
}
