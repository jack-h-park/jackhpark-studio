import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTERVIEW_BANK_SOURCE_URL_PREFIX,
  interviewCardDocId,
  parseInterviewCard,
  prepareInterviewCardDocument,
} from "@/lib/rag/sources/interview-bank";

// Shaped after a real card: quoted question containing a colon, list-valued frontmatter,
// and the full canonical section order.
function card({
  status = "reviewed",
  optIn = true,
  question = "The Hardest Part of Product Management: Saying No",
  sections = [
    ["Why This Question Matters", "Tests prioritisation instincts."],
    ["Answer Draft", "The long spoken answer, with **bold** and detail."],
    ["Short Version", "The one-paragraph version."],
    ["Evidence Notes", "Backed by wiki/cases/build-decisions.md"],
    ["Gaps", "Needs one concrete example if pressed."],
    ["Improvement Notes", "Do not re-add the filler weakness."],
  ] as [string, string][],
}: {
  status?: string;
  optIn?: boolean;
  question?: string;
  sections?: [string, string][];
} = {}): string {
  const front = [
    "---",
    `question: "${question}"`,
    'category: "prioritization-uncertainty-kill-discipline"',
    "target_tags:",
    '  - "general-pm"',
    `status: "${status}"`,
    ...(optIn ? ["publish_to_jackgpt: true"] : []),
    "last_reviewed: 2026-08-04",
    "---",
    "",
  ].join("\n");
  const body = sections.map(([h, c]) => `## ${h}\n\n${c}\n`).join("\n");
  return front + body;
}

void describe("interview card eligibility", () => {
  void it("accepts a reviewed card that is opted in", () => {
    const parsed = parseInterviewCard("saying-no", card());
    assert.ok(parsed);
    assert.equal(parsed.question, "The Hardest Part of Product Management: Saying No");
    assert.equal(parsed.category, "prioritization-uncertainty-kill-discipline");
  });

  void it("accepts delivery_ready as well as reviewed", () => {
    assert.ok(parseInterviewCard("x", card({ status: "delivery_ready" })));
  });

  void it("accepts an opted-in supported draft", () => {
    assert.ok(parseInterviewCard("x", card({ status: "drafted" })));
  });

  void it("rejects a reviewed card that is not opted in", () => {
    // "reviewed" means the answer is good, not that Jack wants it publicly retrievable.
    assert.equal(parseInterviewCard("x", card({ optIn: false })), null);
  });

  void it("rejects an opted-in card that does not have a supported draft", () => {
    for (const status of ["needs_evidence", "new"]) {
      assert.equal(
        parseInterviewCard("x", card({ status, optIn: true })),
        null,
        `status ${status} must not be publishable`,
      );
    }
  });

  void it("rejects a card with no answer sections", () => {
    const stripped = card({
      sections: [["Gaps", "Only private notes here."]],
    });
    assert.equal(parseInterviewCard("x", stripped), null);
  });
});

void describe("interview card content", () => {
  void it("embeds the question with the answer", () => {
    // A visitor's phrasing matches the question far more often than the answer prose.
    const parsed = parseInterviewCard("saying-no", card());
    assert.ok(parsed);
    assert.ok(
      parsed.answer.startsWith("Q: The Hardest Part of Product Management: Saying No"),
    );
    assert.match(parsed.answer, /The one-paragraph version\./);
    assert.match(parsed.answer, /The long spoken answer/);
  });

  void it("never embeds the private sections", () => {
    // The failure this guards is silent and public: the assistant quoting Jack's notes on
    // the weaknesses of his own answers, or internal repo paths.
    const parsed = parseInterviewCard("saying-no", card());
    assert.ok(parsed);
    for (const leak of [
      "Backed by wiki/cases",
      "Needs one concrete example",
      "Do not re-add the filler",
      "Tests prioritisation instincts",
    ]) {
      assert.doesNotMatch(
        parsed.answer,
        new RegExp(leak.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `"${leak}" must not reach the embedded text`,
      );
    }
  });

  void it("keeps a section added later private by default", () => {
    // Allow-list, not deny-list: a new heading in the card template must not silently
    // become public because nobody remembered to exclude it.
    const parsed = parseInterviewCard(
      "x",
      card({
        sections: [
          ["Answer Draft", "public answer"],
          ["Salary Expectations", "a number Jack would not publish"],
        ],
      }),
    );
    assert.ok(parsed);
    assert.doesNotMatch(parsed.answer, /a number Jack would not publish/);
  });

  void it("still works when a card has no Short Version", () => {
    // 11 of 46 cards lack one today.
    const parsed = parseInterviewCard(
      "x",
      card({ sections: [["Answer Draft", "only the draft"]] }),
    );
    assert.ok(parsed);
    assert.match(parsed.answer, /only the draft/);
  });
});

void describe("interview card document", () => {
  void it("derives a canonical 32-hex doc_id, stable and distinct per slug", () => {
    const a = interviewCardDocId("saying-no");
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.equal(a, interviewCardDocId("saying-no"));
    assert.notEqual(a, interviewCardDocId("long-game"));
  });

  void it("uses the sweep-scoped source url", () => {
    // sweepUnvisitedDocuments is scoped by this prefix, so it can only retire interview
    // cards — never a Notion page or an ingested URL.
    const parsed = parseInterviewCard("saying-no", card());
    assert.ok(parsed);
    const doc = prepareInterviewCardDocument(parsed);
    assert.ok(doc.sourceUrl.startsWith(INTERVIEW_BANK_SOURCE_URL_PREFIX));
    assert.ok(doc.sourceUrl.endsWith("saying-no"));
    // Must stay a real https URL: the citation resolver prefixes anything else with
    // https:// and produces a dead link.
    assert.ok(doc.sourceUrl.startsWith("https://"));
    assert.equal(doc.canonicalId, interviewCardDocId("saying-no"));
    assert.equal(doc.changeDetection, "hash");
  });

  void it("classifies the document for retrieval", () => {
    const parsed = parseInterviewCard("saying-no", card());
    assert.ok(parsed);
    const metadata = prepareInterviewCardDocument(parsed).buildMetadata(null);
    assert.ok(metadata && !(metadata instanceof Promise));
    assert.equal(metadata.doc_type, "kb_article");
    assert.equal(metadata.persona_type, "professional");
    assert.equal(metadata.is_public, true);
    assert.ok(metadata.tags?.includes("interview-qa"));
  });
});
