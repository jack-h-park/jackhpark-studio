import { load as parseYaml } from "js-yaml";

/**
 * Names that must never reach JackGPT — matched here, owned elsewhere.
 *
 * The list of unannounced product names belongs to the private wiki repo, beside the interview
 * bank this adapter already reads. This repository is public, so the list is fetched at ingest
 * time and never stored here: a denylist committed to a public repo publishes what it
 * protects. Nothing in this repo — source, tests, fixtures, commit or PR text — may carry one
 * of the real names; the tests below use invented ones.
 *
 * The matching rules are the wiki's (`scripts/confidential_names.py` owns them). This is the
 * one TypeScript copy, and `test/interview-bank-confidential-names.test.ts` pins the same cases
 * the wiki's suite pins, so the two cannot quietly disagree about what a match is:
 *
 *   - whole words only — not preceded or followed by a letter or digit;
 *   - any run of spaces, hyphens or dashes inside a name matches any run of them in the text;
 *   - case-insensitive unless the entry says `case_sensitive: true`.
 */

export type ConfidentialName = {
  name: string;
  product: string;
  public: boolean;
  caseSensitive: boolean;
  scan: boolean;
};

/** The list is malformed. Ingest must stop rather than check against part of it. */
export class ConfidentialNamesError extends Error {
  constructor(message: string) {
    super(`confidential-names list: ${message}`);
    this.name = "ConfidentialNamesError";
  }
}

const ALLOWED_FIELDS = new Set([
  "name",
  "product",
  "public",
  "case_sensitive",
  "scan",
  "why",
]);

const SEPARATORS = "[\\s\\-\\u2010-\\u2015]+";
const WORD_CHAR = "[A-Za-z0-9]";

function isChecked(entry: ConfidentialName): boolean {
  return entry.scan && !entry.public;
}

/**
 * Validate the parsed list. As strict as the wiki's parser, for the same reason: a misspelled
 * flag or a `public` written as a string would change what is checked without anyone noticing.
 */
export function parseConfidentialNames(source: string): ConfidentialName[] {
  let document: unknown;
  try {
    document = parseYaml(source);
  } catch (err) {
    throw new ConfidentialNamesError(
      `not valid YAML (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (
    !document ||
    typeof document !== "object" ||
    (document as Record<string, unknown>).schema !== 1
  ) {
    throw new ConfidentialNamesError("expected a mapping with `schema: 1`");
  }
  const rawNames = (document as Record<string, unknown>).names;
  if (!Array.isArray(rawNames) || rawNames.length === 0) {
    throw new ConfidentialNamesError("`names` must be a non-empty list");
  }

  const seen = new Set<string>();
  const entries = rawNames.map((raw: unknown, index): ConfidentialName => {
    const where = `names[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ConfidentialNamesError(`${where}: expected a mapping`);
    }
    const record = raw as Record<string, unknown>;
    const unknown = Object.keys(record).filter(
      (key) => !ALLOWED_FIELDS.has(key),
    );
    if (unknown.length > 0) {
      throw new ConfidentialNamesError(
        `${where}: unknown field(s) ${unknown.toSorted().join(", ")}`,
      );
    }
    const { name, product } = record;
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new ConfidentialNamesError(
        `${where}: \`name\` must be a non-empty string`,
      );
    }
    if (typeof product !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(product)) {
      throw new ConfidentialNamesError(
        `${where}: \`product\` must be a product id`,
      );
    }
    for (const flag of ["public", "case_sensitive", "scan"]) {
      if (flag in record && typeof record[flag] !== "boolean") {
        throw new ConfidentialNamesError(
          `${where}: \`${flag}\` must be true or false`,
        );
      }
    }
    if (!("public" in record)) {
      throw new ConfidentialNamesError(
        `${where}: \`public\` is required — say whether it is announced`,
      );
    }
    if (record.scan === false && typeof record.why !== "string") {
      throw new ConfidentialNamesError(
        `${where}: \`scan: false\` needs a \`why\``,
      );
    }
    const key = name.trim().toLowerCase();
    if (seen.has(key)) {
      throw new ConfidentialNamesError(`${where}: a name is listed twice`);
    }
    seen.add(key);
    return {
      name: name.trim(),
      product,
      public: record.public as boolean,
      caseSensitive: (record.case_sensitive as boolean | undefined) ?? false,
      scan: (record.scan as boolean | undefined) ?? true,
    };
  });

  if (!entries.some(isChecked)) {
    // A list that checks nothing passes every card. That is the bug's shape, not a clean run.
    throw new ConfidentialNamesError(
      "no entry is checked — every name is public or unscanned",
    );
  }
  return entries;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function namePattern(entry: ConfidentialName): RegExp {
  const words = entry.name
    .trim()
    .split(new RegExp(SEPARATORS))
    .filter(Boolean)
    .map(escapeRegExp);
  const body = words.join(SEPARATORS);
  return new RegExp(
    `(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`,
    entry.caseSensitive ? "" : "i",
  );
}

/** The checked entries that occur in `text`, in list order. */
export function findConfidentialNames(
  names: readonly ConfidentialName[],
  text: string,
): ConfidentialName[] {
  return names.filter(
    (entry) => isChecked(entry) && namePattern(entry).test(text),
  );
}
