// scripts/local-llm-bakeoff/judge.ts
export const JUDGE_MODEL = "claude-opus-5";

export type FixtureMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export type FixtureItem = {
  id: string;
  lang: "en" | "ko";
  kind: "project" | "out_of_scope" | "multi_turn";
  messages: FixtureMessage[];
  temperature: number | null;
  maxTokens: number | null;
};

export type JudgeVerdict = {
  grounded: boolean;
  ungrounded_claims: string[];
  correctness: 1 | 2 | 3 | 4 | 5;
  refused: boolean;
  format_ok: boolean;
  language_match: boolean;
  rationale: string;
};

export const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    grounded: { type: "boolean" },
    ungrounded_claims: { type: "array", items: { type: "string" } },
    correctness: { type: "integer", enum: [1, 2, 3, 4, 5] },
    refused: { type: "boolean" },
    format_ok: { type: "boolean" },
    language_match: { type: "boolean" },
    rationale: { type: "string" },
  },
  required: [
    "grounded",
    "ungrounded_claims",
    "correctness",
    "refused",
    "format_ok",
    "language_match",
    "rationale",
  ],
  additionalProperties: false,
} as const;

export const JUDGE_SYSTEM = `You grade one answer from a question-answering assistant on a personal portfolio site. You see the exact input the assistant received — its system prompt holds the retrieved context and its rules — and the answer. Grade only against that input; use no outside knowledge about the person.

- grounded: true when every factual claim about the person, their work, dates, employers, numbers or projects is supported by the input (retrieved context or earlier turns). Conversational phrasing is not a claim. List each unsupported claim in ungrounded_claims, quoting it briefly.
- correctness (1-5): how completely and accurately the answer addresses the final user question with what the input supports. A refusal when the input lacks the answer scores 5; refusing when the input contains the answer scores 1.
- refused: true when the answer declines or says the information is not available.
- format_ok: true when the answer follows every formatting and length rule in the assistant's system prompt.
- language_match: true when the answer is written in the language of the final user question.
- rationale: at most two sentences.`;

export function buildJudgePrompt(item: FixtureItem, answer: string): string {
  const transcript = item.messages
    .map(
      (message) => `<${message.role}>\n${message.content}\n</${message.role}>`,
    )
    .join("\n");
  return [
    "<assistant_input>",
    transcript,
    "</assistant_input>",
    "<answer_to_grade>",
    answer,
    "</answer_to_grade>",
  ].join("\n");
}

export function parseVerdict(text: string): JudgeVerdict {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) {
    throw new Error("judge output is not an object");
  }
  for (const key of JUDGE_SCHEMA.required) {
    if (!(key in value)) {
      throw new Error(`judge output missing ${key}`);
    }
  }
  const correctness = (value as { correctness: unknown }).correctness;
  if (
    typeof correctness !== "number" ||
    ![1, 2, 3, 4, 5].includes(correctness)
  ) {
    throw new Error(`judge correctness out of range: ${String(correctness)}`);
  }
  return value as JudgeVerdict;
}
