import process from "node:process";

import { HumanMessage } from "@langchain/core/messages";

import { resolveLlmModel } from "@/lib/core/llm-registry";
import { createChatModel } from "@/lib/server/api/llm-provider-factory";

/**
 * Runtime smoke for the Anthropic provider path: confirms each catalog Claude
 * model instantiates and round-trips, and that the supportsSampling branch
 * omits `temperature` for Opus 4.8 (which 400s on sampling params) while
 * keeping it for Sonnet 4.6 / Haiku 4.5.
 *
 * Run: node --import=tsx --env-file=.env.local scripts/smoke/smoke-anthropic-models.ts
 */
const MODEL_IDS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"];
const PROMPT = "Reply with exactly the single word: ok";

async function main() {
  let failures = 0;

  for (const id of MODEL_IDS) {
    const def = resolveLlmModel({ modelId: id, model: id });
    const expectsTemperature = def.supportsSampling !== false;
    try {
      const llm = await createChatModel("anthropic", def.model, 0.2, 64);
      // Inspect the constructed client: temperature must be unset for
      // supportsSampling=false models so LangChain never forwards it.
      const actualTemp = (llm as { temperature?: number }).temperature;
      const tempOk = expectsTemperature
        ? actualTemp === 0.2
        : actualTemp === undefined;

      // Non-streaming invoke exercises the full request the same way the
      // chat path does (streaming:true is set in the factory).
      const res = await llm.invoke([new HumanMessage(PROMPT)]);
      const text = String((res as { content?: unknown }).content ?? "")
        .replaceAll(/\s+/g, " ")
        .trim()
        .slice(0, 60);

      // One streamed token to confirm the streaming path works.
      let streamed = "";
      for await (const chunk of await llm.stream([new HumanMessage(PROMPT)])) {
        streamed += String((chunk as { content?: unknown }).content ?? "");
        if (streamed.length > 0) break;
      }

      const status = tempOk && text.length > 0 && streamed.length > 0;
      if (!status) failures += 1;
      console.log(
        `[smoke] ${id}: ${status ? "PASS" : "FAIL"} | resolved=${def.model} | expectTemp=${expectsTemperature} actualTemp=${String(actualTemp)} tempOk=${tempOk} | invoke="${text}" | streamedFirst="${streamed.slice(0, 20)}"`,
      );
    } catch (err) {
      failures += 1;
      console.error(
        `[smoke] ${id}: FAIL (error)`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (failures > 0) {
    console.error(`[smoke] anthropic models: ${failures} failure(s)`);
    process.exitCode = 1;
  } else {
    console.log("[smoke] anthropic models: all checks passed");
  }
}

await main();
