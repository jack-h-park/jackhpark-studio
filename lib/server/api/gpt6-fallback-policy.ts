const GPT6_FALLBACKS: Record<string, string> = {
  "gpt-6-sol": "claude-sonnet-5",
  "gpt-6-luna": "claude-haiku-4-5-20251001",
};

export function getGpt6FallbackModel(model: string): string | null {
  return GPT6_FALLBACKS[model] ?? null;
}

export function shouldFallbackBeforeStreaming(
  error: unknown,
  responseStarted: boolean,
  generationFailed: boolean,
): boolean {
  if (responseStarted || !generationFailed) return false;
  if (!error || typeof error !== "object") return false;
  const failure = error as {
    status?: unknown;
    code?: unknown;
    cause?: unknown;
  };
  if (typeof failure.status === "number") {
    return (
      failure.status === 408 || failure.status === 429 || failure.status >= 500
    );
  }
  if (typeof failure.code === "string") {
    return ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND"].includes(
      failure.code,
    );
  }
  return failure.cause
    ? shouldFallbackBeforeStreaming(failure.cause, false, true)
    : false;
}
