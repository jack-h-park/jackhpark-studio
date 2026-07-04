import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";
import type { BaseMessage } from "@langchain/core/messages";
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

import { makeRunName } from "@/lib/server/langchain/runnable-config";

type RagAnswerChainInput = {
  question: string;
  guardrailMeta: string;
  contextValue: string;
  memoryValue: string;
  prompt: ChatPromptTemplate;
  llmInstance: BaseLanguageModelInterface;
};

type RagAnswerChainWithPrompt = RagAnswerChainInput & {
  promptInput: BaseMessage[];
};

type RagAnswerChainOutput = RagAnswerChainWithPrompt & {
  stream: AsyncIterable<string>;
};

export function buildRagAnswerChain() {
  const promptRunnable = RunnableLambda.from<
    RagAnswerChainInput,
    RagAnswerChainWithPrompt
  >(async (input) => {
    const promptInput = await input.prompt.formatMessages({
      question: input.question,
      context: input.contextValue,
      memory: input.memoryValue,
      intent: input.guardrailMeta,
    });
    return { ...input, promptInput };
  }).withConfig({
    runName: makeRunName("answer", "prompt"),
  });

  const llmRunnable = RunnableLambda.from<
    RagAnswerChainWithPrompt,
    RagAnswerChainOutput
  >(async (input) => {
    const stream = await input.llmInstance.stream(input.promptInput);
    return { ...input, stream };
  }).withConfig({
    runName: makeRunName("answer", "llm"),
  });

  return RunnableSequence.from([promptRunnable, llmRunnable]);
}
