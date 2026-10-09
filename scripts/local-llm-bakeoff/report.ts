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
    fixture: { type: "string" },
    results: { type: "string", multiple: true },
    scores: { type: "string" },
    reviews: { type: "string" },
    out: { type: "string" },
  },
});

async function main(): Promise<void> {
  if (
    !values.fixture ||
    !values.results?.length ||
    !values.scores ||
    !values.out
  ) {
    throw new Error(
      "--fixture, at least one --results, --scores and --out are required",
    );
  }
  assertOutsideRepo(values.out, repoRoot);
  const fixture = JSON.parse(await readFile(values.fixture, "utf8")) as {
    items?: unknown;
  };
  if (!Array.isArray(fixture.items)) {
    throw new TypeError("fixture has no items array");
  }
  const fixtureItemIds = fixture.items.map((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string"
    ) {
      throw new TypeError("every fixture item needs a string id");
    }
    return item.id;
  });
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

  const summaries = summarize(results, scores, reviews, fixtureItemIds);
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
