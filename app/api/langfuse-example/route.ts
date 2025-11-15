import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

import {
  getAppEnv,
  observe,
  updateActiveTrace,
} from "@/lib/langfuse";

export const runtime = "nodejs";

const handler = async (req: Request): Promise<Response> => {
  const body = (await req.json().catch(() => ({}))) as {
    chatId?: string;
    userId?: string;
    message?: string;
  };

  const env = getAppEnv();
  const chatId = body.chatId ?? "demo-session";
  const userId = body.userId ?? "anonymous";
  const prompt = body.message ?? "Hello from Langfuse demo!";

  updateActiveTrace({
    name: "minimal-chat",
    sessionId: chatId,
    userId,
    input: prompt,
    metadata: { env },
  });

  const result = streamText({
    model: openai("gpt-4o-mini"),
    messages: [{ role: "user", content: prompt }],
    experimental_telemetry: { isEnabled: true },
  });

  return result.toTextStreamResponse();
};

export const POST = observe(handler, {
  name: "chat-handler",
  endOnExit: false,
});
