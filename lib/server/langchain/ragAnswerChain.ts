import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";
import type { PromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";

type RagAnswerChainInput = {
  question: string;
  guardrailMeta: string;
  contextValue: string;
  memoryValue: string;
  prompt: PromptTemplate;
  llmInstance: BaseLanguageModelInterface;
};

type RagAnswerChainState = RagAnswerChainInput & {
  promptInput?: string;
};

type RagAnswerChainOutput = RagAnswerChainState & {
  promptInput: string;
  stream: AsyncIterable<string>;
};

export function buildRagAnswerChain() {
  const promptRunnable = RunnableLambda.from<
    RagAnswerChainInput,
    RagAnswerChainState & { promptInput: string }
  >(async (input) => {
    const promptInput = await input.prompt.format({
      question: input.question,
      context: input.contextValue,
      memory: input.memoryValue,
      intent: input.guardrailMeta,
    });
    return { ...input, promptInput };
  });

  const llmRunnable = RunnableLambda.from<
    RagAnswerChainState & { promptInput: string },
    RagAnswerChainOutput
  >(async (input) => {
    const stream = await input.llmInstance.stream(input.promptInput);
    return { ...input, stream };
  });

  return RunnableSequence.from([promptRunnable, llmRunnable]);
}
