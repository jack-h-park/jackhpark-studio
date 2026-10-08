// scripts/local-llm-bakeoff/score.ts
import { appendFile, readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import Anthropic from "@anthropic-ai/sdk";

import {
  buildJudgePrompt,
  type FixtureItem,
  JUDGE_MODEL,
  JUDGE_SCHEMA,
  JUDGE_SYSTEM,
  parseVerdict,
} from "./judge";
import { assertOutsideRepo } from "./private-path.mjs";
import { readJsonl } from "./results-store.mjs";

// Claude Opus 5 list price, USD per million tokens. The output estimate
// includes adaptive thinking, which is billed as output.
const INPUT_USD_PER_MTOK = 5;
const OUTPUT_USD_PER_MTOK = 25;
const ESTIMATED_OUTPUT_TOKENS = 3000;
const CONCURRENCY = 4;

type AnswerRow = { variant: string; itemId: string; text: string };

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const { values } = parseArgs({
  options: {
    fixture: { type: "string" },
    results: { type: "string", multiple: true },
    out: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});

async function pool<T>(
  inputs: T[],
  size: number,
  worker: (input: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < inputs.length) {
        const input = inputs[next];
        next += 1;
        await worker(input);
      }
    }),
  );
}

function toAnswerRows(rows: Record<string, unknown>[]): AnswerRow[] {
  return rows.flatMap((row) =>
    row.pass === "baseline" &&
    row.rep === 1 &&
    row.ok === true &&
    typeof row.text === "string"
      ? [
          {
            variant: String(row.variant),
            itemId: String(row.itemId),
            text: row.text,
          },
        ]
      : [],
  );
}

async function main() {
  if (!values.fixture || !values.results?.length || !values.out) {
    throw new Error("--fixture, at least one --results and --out are required");
  }
  const outPath = values.out;
  assertOutsideRepo(outPath, repoRoot);
  const { items } = JSON.parse(await readFile(values.fixture, "utf8")) as {
    items: FixtureItem[];
  };
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const answers = (
    await Promise.all(values.results.map((path) => readJsonl(path)))
  ).flatMap(toAnswerRows);
  const done = new Set(
    (await readJsonl(outPath).catch(() => [])).map(
      (row) => `${String(row.variant)}|${String(row.itemId)}`,
    ),
  );
  const pending = answers.filter(
    (answer) => !done.has(`${answer.variant}|${answer.itemId}`),
  );

  const inputTokens = pending.reduce((sum, answer) => {
    const item = itemsById.get(answer.itemId);
    return (
      sum +
      (item
        ? (JUDGE_SYSTEM.length + buildJudgePrompt(item, answer.text).length) / 4
        : 0)
    );
  }, 0);
  const usd =
    (inputTokens * INPUT_USD_PER_MTOK +
      pending.length * ESTIMATED_OUTPUT_TOKENS * OUTPUT_USD_PER_MTOK) /
    1_000_000;
  console.log(
    `${pending.length} answers to judge with ${JUDGE_MODEL}; estimated cost ≈ $${usd.toFixed(2)}`,
  );
  if (!values.yes) {
    console.log("Rerun with --yes to spend it.");
    return;
  }

  const client = new Anthropic({ maxRetries: 5 });
  await pool(pending, CONCURRENCY, async (answer) => {
    const item = itemsById.get(answer.itemId);
    if (!item) {
      throw new Error(`answer for unknown fixture item ${answer.itemId}`);
    }
    const base = {
      variant: answer.variant,
      itemId: answer.itemId,
      lang: item.lang,
      kind: item.kind,
    };
    try {
      const response = await client.beta.messages.create({
        model: JUDGE_MODEL,
        max_tokens: 16_000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: {
          effort: "high",
          format: { type: "json_schema", schema: JUDGE_SCHEMA },
        },
        system: JUDGE_SYSTEM,
        messages: [
          { role: "user", content: buildJudgePrompt(item, answer.text) },
        ],
      });
      if (response.stop_reason === "refusal") {
        await appendFile(
          outPath,
          `${JSON.stringify({ ...base, judgeError: "refusal" })}\n`,
        );
        return;
      }
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      await appendFile(
        outPath,
        `${JSON.stringify({ ...base, ...parseVerdict(text), judgeModel: response.model })}\n`,
      );
      console.log(`[score] ${answer.variant} ${answer.itemId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await appendFile(
        outPath,
        `${JSON.stringify({ ...base, judgeError: message })}\n`,
      );
      console.error(
        `[score] ${answer.variant} ${answer.itemId} failed: ${message}`,
      );
    }
  });
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
