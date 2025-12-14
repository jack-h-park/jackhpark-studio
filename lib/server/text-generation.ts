import type { ModelProvider } from "@/lib/shared/model-provider";
import { getLmStudioRuntimeConfig } from "@/lib/core/lmstudio";
import { requireProviderApiKey } from "@/lib/core/model-provider";
import { getOllamaRuntimeConfig } from "@/lib/core/ollama";
import { getOpenAIClient } from "@/lib/core/openai";

export type TextGenRequest = {
  provider: ModelProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
};

export async function generateText(
  request: TextGenRequest,
): Promise<string> {
  switch (request.provider) {
    case "openai":
      return generateWithOpenAI(request);
    case "gemini":
      return generateWithGemini(request);
    case "ollama":
      return generateWithOllama(request);
    case "lmstudio":
      return generateWithLmStudio(request);
    default:
      throw new Error(
        `[text-generation] Provider "${request.provider}" is not supported.`,
      );
  }
}

async function generateWithOpenAI(request: TextGenRequest): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: request.model,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    messages: buildMessages(request),
  });
  return response.choices?.at(0)?.message?.content?.trim() ?? "";
}

async function generateWithGemini(request: TextGenRequest): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = requireProviderApiKey("gemini");
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: request.model,
    systemInstruction: request.systemPrompt,
  });
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: request.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
    },
  });
  const text = result.response.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();
  return text ?? "";
}

async function generateWithOllama(request: TextGenRequest): Promise<string> {
  const config = getOllamaRuntimeConfig();
  if (!config.enabled || !config.baseUrl) {
    throw new Error(
      "[text-generation] Ollama provider is disabled in this environment.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const payload = {
    model: request.model,
    stream: false,
    messages: buildMessages(request),
    options: buildOllamaOptions(request.maxTokens, request.temperature, {
      envMaxTokens: config.maxTokens,
    }),
  };

  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText} - ${text}`,
      );
    }

    const data = await response.json();
    const message = (data as any)?.message;
    let content = "";
    if (typeof message?.content === "string") {
      content = message.content;
    } else if (Array.isArray(message?.content)) {
      content = message.content
        .map((part: any) => {
          if (typeof part === "string") return part;
          if (typeof part?.text === "string") return part.text;
          if (typeof part?.content === "string") return part.content;
          return "";
        })
        .join("");
    }

    return content.trim();
  } catch (err) {
    throw new Error(
      `[text-generation] Ollama text generation failed for model "${request.model}": ${err}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithLmStudio(request: TextGenRequest): Promise<string> {
  const config = getLmStudioRuntimeConfig();
  if (!config.enabled || !config.baseUrl) {
    throw new Error(
      "[text-generation] LM Studio provider is disabled or missing a base URL.",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.LMSTUDIO_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller =
    typeof config.timeoutMs === "number" && config.timeoutMs > 0
      ? new AbortController()
      : null;
  const timeoutHandle = controller
    ? setTimeout(() => controller.abort(), config.timeoutMs!)
    : null;

  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;
  const baseMessages = buildMessages(request);
  const payload = {
    model: request.model,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    messages: adaptMessagesForLmStudio(baseMessages),
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `LM Studio API error: ${response.status} ${response.statusText} - ${text}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
    };
    const choice = data.choices?.[0];
    const content =
      choice?.message?.content ??
      (typeof choice?.text === "string" ? choice.text : "");
    return content?.trim() ?? "";
  } catch (err) {
    throw new Error(
      `[text-generation] LM Studio text generation failed for model "${request.model}": ${err}`,
    );
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function buildMessages(request: TextGenRequest): ChatCompletionMessage[] {
  return [
    { role: "system", content: request.systemPrompt },
    { role: "user", content: request.userPrompt },
  ];
}

function adaptMessagesForLmStudio(
  messages: ChatCompletionMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];
  let pendingSystem: string[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content?.trim()) {
        pendingSystem.push(message.content.trim());
      }
      continue;
    }

    const contentParts = [] as string[];
    if (pendingSystem.length > 0) {
      contentParts.push(pendingSystem.join("\n\n"));
      pendingSystem = [];
    }
    if (message.content?.trim()) {
      contentParts.push(message.content.trim());
    }

    if (contentParts.length === 0) {
      continue;
    }

    normalized.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: contentParts.join("\n\n"),
    });
  }

  if (pendingSystem.length > 0) {
    normalized.unshift({
      role: "user",
      content: pendingSystem.join("\n\n"),
    });
  }

  return normalized;
}

function buildOllamaOptions(
  maxTokens: number,
  temperature: number,
  options: { envMaxTokens: number | null },
): Record<string, number> {
  const resolvedMax = resolveMaxTokens(maxTokens, options.envMaxTokens);
  const payload: Record<string, number> = {};
  if (Number.isFinite(temperature)) {
    payload.temperature = temperature;
  }
  if (typeof resolvedMax === "number" && resolvedMax > 0) {
    payload.num_predict = resolvedMax;
  }
  return payload;
}

function resolveMaxTokens(
  requestMax: number,
  envMax: number | null,
): number | null {
  const candidates: number[] = [];
  if (typeof requestMax === "number" && requestMax > 0) {
    candidates.push(requestMax);
  }
  if (typeof envMax === "number" && envMax > 0) {
    candidates.push(envMax);
  }
  if (!candidates.length) {
    return null;
  }
  const resolved = Math.min(...candidates);
  return Number.isFinite(resolved) && resolved > 0
    ? Math.floor(resolved)
    : null;
}
