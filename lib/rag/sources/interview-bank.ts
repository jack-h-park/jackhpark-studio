import { createHash } from "node:crypto";

import { load as parseYaml } from "js-yaml";

import type { PreparedDocument } from "../pipeline";
import { deriveDocIdentifiers } from "../../server/doc-identifiers";
import { applyDefaultDocMetadata, mergeRagDocumentMetadata } from "../metadata";

/**
 * Interview Q&A bank adapter.
 *
 * The bank lives as one markdown file per question in the (private) wiki repo, written by
 * `[Agent] interview-ops` during drills. It is read from GitHub rather than from disk:
 * `lib/rag` has no filesystem access and the ingest runs serverless, so the pushed git state
 * is the only source it can see — and it is the better one anyway, since the commit
 * reconciler pushes every 30 minutes and a working tree would make ingestion depend on which
 * machine ran it.
 *
 * Deliberately not routed through Notion. There is no markdown→Notion renderer in this
 * stack, and `_is_public: false` would remove a page from retrieval as well as from the
 * site, so "answerable but unlisted" is not reachable that way.
 */

const DEFAULT_REPO = "jack-h-park/product-management-wiki";
const DEFAULT_BRANCH = "main";
const DEFAULT_PATH = "interview-prep/questions";

/**
 * Cards are only eligible once Jack has reviewed them *and* opted them in.
 *
 * The status gate alone is not enough: "reviewed" means the answer is good, not that he
 * wants it publicly retrievable. Requiring an explicit field keeps that a decision rather
 * than a side effect of the drill loop advancing a status.
 */
const PUBLISHABLE_STATUSES = new Set(["reviewed", "delivery_ready"]);
const OPT_IN_FIELD = "publish_to_jackgpt";

/** Sections that carry the answer. Everything else in a card stays private — see below. */
const ANSWER_SECTIONS = ["Short Version", "Answer Draft"] as const;

/**
 * `source_url` doubles as the sweep scope (`sweepUnvisitedDocuments({ sourceUrlPrefix })`),
 * so it has to be a stable prefix — and a live one, because the resolver hands whatever is
 * here to the citation UI. These cards have no public page of their own; /chat is where the
 * material actually lives, and the fragment keeps each document distinguishable in the admin
 * documents list without pointing anywhere broken.
 */
export const INTERVIEW_BANK_SOURCE_URL_PREFIX =
  "https://www.jackhpark.com/chat#interview-qa/";

export type InterviewCard = {
  slug: string;
  question: string;
  category: string | null;
  status: string;
  lastReviewed: string | null;
  /** Answer text, already stripped of the private sections. */
  answer: string;
};

type Frontmatter = Record<string, unknown>;

function splitFrontmatter(source: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  if (!source.startsWith("---")) {
    return { frontmatter: {}, body: source };
  }
  const end = source.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: source };
  }
  const raw = source.slice(source.indexOf("\n") + 1, end);
  const parsed = parseYaml(raw);
  const frontmatter =
    parsed && typeof parsed === "object" ? (parsed as Frontmatter) : {};
  const bodyStart = source.indexOf("\n", end + 1);
  return { frontmatter, body: bodyStart === -1 ? "" : source.slice(bodyStart + 1) };
}

/** Body split into `## Heading` → content. */
function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (heading !== null) {
      sections.set(heading, buffer.join("\n").trim());
    }
  };

  for (const line of body.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[1]!;
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Parse one card, returning null when it is not eligible.
 *
 * Ineligibility is ordinary, not an error: most of the bank is mid-drill at any moment.
 */
/** Why a card is not published. Ordinary states, not errors — most of the bank is mid-drill. */
export type InterviewCardExclusion =
  | "status-not-review-complete"
  | "not-opted-in"
  | "no-question"
  | "no-answer-sections";

export type InterviewCardVerdict =
  | { eligible: true; card: InterviewCard }
  | {
      eligible: false;
      reason: InterviewCardExclusion;
      /** What is known about the card even though it is excluded, for the preview. */
      slug: string;
      question: string | null;
      status: string | null;
      optedIn: boolean;
    };

/**
 * The single eligibility decision.
 *
 * `parseInterviewCard` and the admin preview both go through this. A preview computed by a
 * second copy of these rules would be worse than no preview: it would show text as
 * "about to be published" that the ingest disagrees about, and the disagreement would
 * surface as a surprise in a public assistant.
 */
export function inspectInterviewCard(
  slug: string,
  source: string,
): InterviewCardVerdict {
  const { frontmatter, body } = splitFrontmatter(source);

  const status = asString(frontmatter.status);
  const question = asString(frontmatter.question);
  const optedIn = frontmatter[OPT_IN_FIELD] === true;
  const known = { slug, question, status, optedIn };

  if (!status || !PUBLISHABLE_STATUSES.has(status)) {
    return { eligible: false, reason: "status-not-review-complete", ...known };
  }
  if (!optedIn) {
    return { eligible: false, reason: "not-opted-in", ...known };
  }
  if (!question) {
    return { eligible: false, reason: "no-question", ...known };
  }

  const sections = splitSections(body);
  // Only the answer sections are ever embedded. `Evidence Notes`, `Gaps` and
  // `Improvement Notes` hold self-critique and internal repo paths; leaking those into a
  // public assistant's context is the failure mode this gate exists for, and it is a silent
  // one — nothing breaks, the assistant simply starts quoting Jack's notes on his own
  // weaknesses. Allow-list, never deny-list: a section added later is private by default.
  const answerParts = ANSWER_SECTIONS.map((name) => sections.get(name)).filter(
    (part): part is string => Boolean(part && part.length > 0),
  );

  if (answerParts.length === 0) {
    return { eligible: false, reason: "no-answer-sections", ...known };
  }

  return {
    eligible: true,
    card: {
      slug,
      question,
      category: asString(frontmatter.category),
      status,
      lastReviewed: asString(frontmatter.last_reviewed),
      // The question is embedded with the answer on purpose: a visitor's phrasing matches
      // the question far more often than it matches the answer prose.
      answer: [`Q: ${question}`, ...answerParts].join("\n\n"),
    },
  };
}

/**
 * Parse one card, returning null when it is not eligible.
 *
 * Ineligibility is ordinary, not an error: most of the bank is mid-drill at any moment.
 */
export function parseInterviewCard(
  slug: string,
  source: string,
): InterviewCard | null {
  const verdict = inspectInterviewCard(slug, source);
  return verdict.eligible ? verdict.card : null;
}

/**
 * A canonical 32-hex doc_id for a card.
 *
 * Notion pages supply one; these have no external id, and `deriveDocIdentifiers` only strips
 * dashes — it does not hash — so an unhashed slug would land as a non-canonical id and warn.
 * Deriving one keeps the invariant, and its checkers, meaningful.
 */
export function interviewCardDocId(slug: string): string {
  return createHash("sha256")
    .update(`interview-qa:${slug}`)
    .digest("hex")
    .slice(0, 32);
}

export function prepareInterviewCardDocument(
  card: InterviewCard,
): PreparedDocument {
  const rawId = interviewCardDocId(card.slug);
  const { canonicalId } = deriveDocIdentifiers(rawId);

  return {
    canonicalId,
    rawId,
    label: `Interview card "${card.question}" (${card.slug})`,
    sourceUrl: `${INTERVIEW_BANK_SOURCE_URL_PREFIX}${card.slug}`,
    title: card.question,
    text: card.answer,
    // `last_reviewed` is a date the agent stamps, not a content timestamp, so it cannot be
    // trusted to move when the text does. Content hash alone decides.
    lastSourceUpdate: card.lastReviewed,
    statusCode: null,
    changeDetection: "hash",
    buildMetadata: (existingMetadata) => {
      const merged = mergeRagDocumentMetadata(existingMetadata, {
        title: card.question,
        source_kind: "interview_bank",
        source_type: "markdown",
        origin_id: card.slug,
        tags: ["interview-qa", card.category].filter(
          Boolean,
        ),
        is_public: true,
      });
      return applyDefaultDocMetadata(merged, {
        // Starting inside the existing enum avoids a schema change; these read as knowledge
        // articles for ranking purposes, which is what they are.
        doc_type: "kb_article",
        persona_type: "professional",
      });
    },
  };
}

type GithubContentEntry = { name: string; type: string; download_url: string | null };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. The interview bank lives in a private repo, so reading it needs a token with contents:read.`,
    );
  }
  return value;
}

/** List and fetch every card file, returning only the eligible ones. */
/** One card file as fetched, before any eligibility judgement. */
export type InterviewBankFile = { slug: string; source: string };

/**
 * Fetch every card file. The ingest and the preview share this so they cannot disagree
 * about which files exist, only about what to do with them.
 */
export async function fetchInterviewBankFiles(): Promise<InterviewBankFile[]> {
  const repo = process.env.INTERVIEW_BANK_REPO ?? DEFAULT_REPO;
  const branch = process.env.INTERVIEW_BANK_BRANCH ?? DEFAULT_BRANCH;
  const dir = process.env.INTERVIEW_BANK_PATH ?? DEFAULT_PATH;
  const token = requireEnv("INTERVIEW_BANK_GITHUB_TOKEN");

  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "jackhpark-studio-ingest",
  };

  const listUrl = `https://api.github.com/repos/${repo}/contents/${dir}?ref=${encodeURIComponent(branch)}`;
  const listResponse = await fetch(listUrl, { headers });
  if (!listResponse.ok) {
    throw new Error(
      `Failed to list ${repo}/${dir}@${branch}: ${listResponse.status} ${listResponse.statusText}`,
    );
  }

  const entries = (await listResponse.json()) as GithubContentEntry[];
  const files = entries.filter(
    (entry) => entry.type === "file" && entry.name.endsWith(".md"),
  );

  const out: InterviewBankFile[] = [];
  for (const file of files) {
    if (!file.download_url) continue;
    const response = await fetch(file.download_url, { headers });
    if (!response.ok) {
      throw new Error(
        `Failed to read ${file.name}: ${response.status} ${response.statusText}`,
      );
    }
    out.push({
      slug: file.name.replace(/\.md$/, ""),
      source: await response.text(),
    });
  }

  return out;
}

/** List and fetch every card file, returning only the eligible ones. */
export async function fetchInterviewBankCards(): Promise<InterviewCard[]> {
  const files = await fetchInterviewBankFiles();
  const cards: InterviewCard[] = [];
  for (const file of files) {
    const card = parseInterviewCard(file.slug, file.source);
    if (card) cards.push(card);
  }
  return cards;
}

export type InterviewBankPreviewEntry = {
  slug: string;
  question: string | null;
  status: string | null;
  optedIn: boolean;
  eligible: boolean;
  reason: InterviewCardExclusion | null;
  /** Exactly the text that would be embedded. Only present for eligible cards. */
  text: string | null;
  characters: number | null;
};

export type InterviewBankPreview = {
  total: number;
  eligible: number;
  entries: InterviewBankPreviewEntry[];
};

/**
 * What the next ingest would publish, without publishing it.
 *
 * Reads and judges only: no embedding, no Supabase, no run record. The section filter is the
 * one part of this adapter whose failure is silent and public — a card's self-critique or an
 * internal repo path reaching a public assistant breaks nothing and announces nothing — so
 * being able to read the exact text before it is embedded is the point.
 */
export async function previewInterviewBank(): Promise<InterviewBankPreview> {
  const files = await fetchInterviewBankFiles();
  const entries = files.map((file): InterviewBankPreviewEntry => {
    const verdict = inspectInterviewCard(file.slug, file.source);
    if (verdict.eligible) {
      return {
        slug: verdict.card.slug,
        question: verdict.card.question,
        status: verdict.card.status,
        optedIn: true,
        eligible: true,
        reason: null,
        text: verdict.card.answer,
        characters: verdict.card.answer.length,
      };
    }
    return {
      slug: verdict.slug,
      question: verdict.question,
      status: verdict.status,
      optedIn: verdict.optedIn,
      eligible: false,
      reason: verdict.reason,
      text: null,
      characters: null,
    };
  });

  entries.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });

  return {
    total: entries.length,
    eligible: entries.filter((entry) => entry.eligible).length,
    entries,
  };
}
