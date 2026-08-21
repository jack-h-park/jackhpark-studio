import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  inspectInterviewCard,
  parseInterviewCard,
} from "@/lib/rag/sources/interview-bank";

const repoRoot = process.cwd();

function card({
  status = "reviewed",
  optIn = true,
  question = "How do you prioritize?",
  sections = [
    ["Answer Draft", "the long answer"],
    ["Short Version", "the short answer"],
    ["Gaps", "PRIVATE: needs an example"],
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
    `status: "${status}"`,
    ...(optIn ? ["publish_to_jackgpt: true"] : []),
    "---",
    "",
  ].join("\n");
  return front + sections.map(([h, c]) => `## ${h}\n\n${c}\n`).join("\n");
}

void describe("preview and ingest share one decision", () => {
  void it("agrees with parseInterviewCard on every gate", () => {
    // This is the whole reason `inspectInterviewCard` exists. A preview computed by a second
    // copy of these rules would show text as "about to be published" that the ingest
    // disagrees about — and the disagreement would surface in a public assistant.
    const cases = [
      card(),
      card({ optIn: false }),
      card({ status: "drafted" }),
      card({ status: "delivery_ready" }),
      card({ question: "" }),
      card({ sections: [["Gaps", "only private"]] }),
      card({ sections: [["Answer Draft", "draft only"]] }),
    ];
    for (const [index, source] of cases.entries()) {
      const verdict = inspectInterviewCard(`case-${index}`, source);
      const parsed = parseInterviewCard(`case-${index}`, source);
      assert.equal(
        verdict.eligible,
        parsed !== null,
        `case ${index}: preview says ${verdict.eligible}, ingest says ${parsed !== null}`,
      );
      if (verdict.eligible && parsed) {
        // Not just "both agree it publishes" — the same bytes.
        assert.equal(verdict.card.answer, parsed.answer, `case ${index}: text differs`);
      }
    }
  });

  void it("names why a card is held back", () => {
    const reasons = {
      "status-not-review-complete": card({ status: "drafted" }),
      "not-opted-in": card({ optIn: false }),
      "no-answer-sections": card({ sections: [["Gaps", "x"]] }),
    } as const;
    for (const [expected, source] of Object.entries(reasons)) {
      const verdict = inspectInterviewCard("x", source);
      assert.equal(verdict.eligible, false);
      if (!verdict.eligible) assert.equal(verdict.reason, expected);
    }
  });

  void it("still reports what it knows about an excluded card", () => {
    // The preview has to be readable: "held back" with no status and no question is not
    // something an operator can act on.
    const verdict = inspectInterviewCard("x", card({ optIn: false }));
    assert.equal(verdict.eligible, false);
    if (!verdict.eligible) {
      assert.equal(verdict.status, "reviewed");
      assert.equal(verdict.optedIn, false);
      assert.equal(verdict.question, "How do you prioritize?");
    }
  });

  void it("never exposes a private section through the preview", () => {
    const verdict = inspectInterviewCard("x", card());
    assert.ok(verdict.eligible);
    if (verdict.eligible) {
      assert.doesNotMatch(verdict.card.answer, /PRIVATE/);
    }
  });
});

void describe("the preview surface is read-only", () => {
  void it("does not embed, record a run, or touch Supabase", () => {
    // A "preview" that writes is not a preview. The route must reach the adapter and stop.
    const route = readFileSync(
      path.join(repoRoot, "pages/api/admin/interview-bank-preview.ts"),
      "utf8",
    );
    for (const forbidden of [
      "ingestPreparedDocument",
      "startIngestRun",
      "runManualIngestion",
      "supabase",
    ]) {
      assert.doesNotMatch(
        route,
        new RegExp(forbidden, "i"),
        `the preview route must not reference ${forbidden}`,
      );
    }
    assert.match(route, /previewInterviewBank/);
  });
});
