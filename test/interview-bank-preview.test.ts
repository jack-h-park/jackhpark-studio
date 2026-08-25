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
      "status-not-publishable": card({ status: "needs_evidence" }),
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

void describe("the preview page inherits the admin surface", () => {
  void it("composes the shared primitives instead of a bespoke list", () => {
    // The first version hand-rolled a <ul> and its own CSS module, so it did not match any
    // neighbouring admin page — inconsistent spacing, typography and badges. The vocabulary
    // already existed; the fix was to use it, and this keeps it used.
    const page = readFileSync(
      path.join(repoRoot, "pages/admin/interview-bank.tsx"),
      "utf8",
    );
    for (const shared of [
      "AdminPageShell",
      "IngestionSubNav",
      "AiPageChrome",
      "DataTable",
      "StatusPill",
      "DashboardStatTile",
      "InlineAlert",
    ]) {
      assert.match(page, new RegExp(shared), `the page must use ${shared}`);
    }
    assert.doesNotMatch(
      page,
      /interview-bank\.module\.css/,
      "a page-private stylesheet is how the surface drifts apart again",
    );
  });

  void it("renders on the server so the table is not empty on arrival", () => {
    // ~46 GitHub reads after paint left the page blank for seconds.
    const page = readFileSync(
      path.join(repoRoot, "pages/admin/interview-bank.tsx"),
      "utf8",
    );
    assert.match(page, /export const getServerSideProps/);
    assert.doesNotMatch(
      page,
      /fetch\("\/api\/admin\/interview-bank-preview"\)/,
      "the page must not re-fetch its own data on the client",
    );
  });

  void it("fetches the card files concurrently", () => {
    // One round trip per file, serial, is latency not work.
    const adapter = readFileSync(
      path.join(repoRoot, "lib/rag/sources/interview-bank.ts"),
      "utf8",
    );
    assert.match(adapter, /pMap\(/);
    assert.match(adapter, /INTERVIEW_BANK_FETCH_CONCURRENCY/);
  });
});
