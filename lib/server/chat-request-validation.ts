import type { ChatRequestBody } from "./chat-common";

type ChatRequestValidation =
  | { ok: true; body: ChatRequestBody }
  | { ok: false; status: 400 | 405; error: string };

export function validateChatRequest(
  method: string | undefined,
  input: unknown,
): ChatRequestValidation {
  if (method !== "POST") {
    return { ok: false, status: 405, error: "Method Not Allowed" };
  }

  let body: unknown = input;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      body = null;
    }
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("messages" in body) ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    return {
      ok: false,
      status: 400,
      error: "messages array with at least one entry is required",
    };
  }

  return { ok: true, body: body as ChatRequestBody };
}
