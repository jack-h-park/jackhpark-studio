// scripts/local-llm-bakeoff/fixture.mjs

/**
 * @typedef {{ role: "system" | "user" | "assistant"; content: string }} ChatMessage
 * @typedef {{ id: string; lang: "en" | "ko"; kind: "project" | "out_of_scope" | "multi_turn"; turns: ChatMessage[] }} Question
 * @typedef {{ label: string | null; seq: number; body: { stream?: boolean; temperature?: number; max_tokens?: number; max_completion_tokens?: number; messages: { role: string; content: unknown }[] } }} RecordedRequest
 */

/** @param {Question} question */
function finalUserText(question) {
  const last = question.turns.at(-1);
  if (!last || last.role !== "user") {
    throw new Error(`question ${question.id} must end with a user turn`);
  }
  return last.content;
}

/**
 * For each question, keeps the request that produced the streamed answer: the
 * last streamed call recorded under its label. Any other call under the same
 * label is auxiliary (query rewrite, HyDE, history summary); the recorder
 * answered it with a stub, so the answer request was built from that stub and
 * the whole fixture is refused.
 * @param {Question[]} questions
 * @param {RecordedRequest[]} recorded
 */
export function buildFixture(questions, recorded) {
  const items = questions.map((question) => {
    const calls = recorded.filter((request) => request.label === question.id);
    const main = calls.filter((request) => request.body.stream === true).at(-1);
    if (!main) {
      throw new Error(
        `no streamed request recorded for ${question.id}; the app did not route it to the recorder (check the model allowlist and LMSTUDIO_BASE_URL)`,
      );
    }
    for (const message of main.body.messages) {
      if (typeof message.content !== "string") {
        throw new TypeError(
          `recorded message in ${question.id} has non-string content`,
        );
      }
    }
    const last = main.body.messages.at(-1);
    if (
      !last ||
      last.role !== "user" ||
      typeof last.content !== "string" ||
      !last.content.includes(finalUserText(question))
    ) {
      throw new Error(
        `recorded answer request for ${question.id} does not end with its question`,
      );
    }
    return {
      id: question.id,
      lang: question.lang,
      kind: question.kind,
      messages: main.body.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature:
        typeof main.body.temperature === "number"
          ? main.body.temperature
          : null,
      maxTokens:
        main.body.max_tokens ?? main.body.max_completion_tokens ?? null,
      auxiliaryCalls: calls.length - 1,
    };
  });
  const withAuxiliary = items
    .filter((item) => item.auxiliaryCalls > 0)
    .map((item) => item.id);
  if (withAuxiliary.length > 0) {
    throw new Error(
      `${withAuxiliary.join(", ")}: the app made extra model calls (query rewrite, HyDE or history summary) that the recorder answered with a stub, so the recorded input is not production input; disable those features for the recording session or record these items another way`,
    );
  }
  return { items };
}
