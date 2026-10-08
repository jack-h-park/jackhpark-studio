import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { assertOutsideRepo } from "./private-path.mjs";
import { readJsonl } from "./results-store.mjs";
import {
  renderReport,
  type ResultRow,
  type Review,
  type ScoreRow,
  summarize,
} from "./summarize";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const { values } = parseArgs({
  options: {
    results: { type: "string", multiple: true },
    scores: { type: "string" },
    reviews: { type: "string" },
    out: { type: "string" },
  },
});

async function main(): Promise<void> {
  if (!values.results?.length || !values.scores || !values.out) {
    throw new Error("at least one --results, --scores and --out are required");
  }
  assertOutsideRepo(values.out, repoRoot);
  const results = (
    await Promise.all(values.results.map((path) => readJsonl(path)))
  ).flat() as ResultRow[];
  const scores = (await readJsonl(values.scores)) as ScoreRow[];

  let reviews: Review[] = [];
  if (values.reviews) {
    const parsed = JSON.parse(await readFile(values.reviews, "utf8")) as {
      reviews?: unknown;
    };
    if (!Array.isArray(parsed.reviews)) {
      throw new Error('reviews.json must contain a "reviews" array');
    }
    reviews = parsed.reviews as Review[];
  }

  const summaries = summarize(results, scores, reviews);
  await writeFile(values.out, renderReport(summaries));
  for (const s of summaries) {
    console.log(
      `${s.variant}: ${s.gate}${s.failedCriteria.length ? ` (${s.failedCriteria.join(", ")})` : ""}`,
    );
  }
}

try {
  await main();
} catch (err: unknown) {
  console.error(err);
  process.exitCode = 1;
}
