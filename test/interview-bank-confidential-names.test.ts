import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  withdrawWithheldCards,
  WITHHELD_REASON,
} from "@/lib/rag/interview-bank-withdraw";
import {
  type ConfidentialName,
  ConfidentialNamesError,
  findConfidentialNames,
  parseConfidentialNames,
} from "@/lib/rag/sources/confidential-names";
import {
  fetchInterviewBankCards,
  inspectInterviewCard,
  judgeInterviewBank,
  previewInterviewBank,
} from "@/lib/rag/sources/interview-bank";

/**
 * The name gate: an opted-in card whose embedded text names an unannounced product is refused.
 *
 * Every name here is invented. The real list lives in the private wiki and is fetched at ingest
 * time; this repository is public, and a test fixture is as public as anything else in it.
 */

function entry(
  name: string,
  flags: Partial<Omit<ConfidentialName, "name">> = {},
): ConfidentialName {
  return {
    name,
    product: "example-product",
    public: false,
    caseSensitive: false,
    scan: true,
    ...flags,
  };
}

const NAMES = [
  entry("Acme Ultra"),
  entry("ZQX", { caseSensitive: true }),
  entry("Beacon", { public: true }),
];

function card(
  sections: [string, string][],
  question = "How do you set strategy?",
) {
  return [
    "---",
    `question: "${question}"`,
    'status: "reviewed"',
    "publish_to_jackgpt: true",
    "---",
    "",
    ...sections.map(([heading, body]) => `## ${heading}\n\n${body}\n`),
  ].join("\n");
}

// The wiki's suite (tests/test_confidential_names.py) pins these same cases against the Python
// matcher. Change one, change both.
const MATCHING_CASES: [string, boolean, string, boolean][] = [
  ["Acme Ultra", false, "we shipped Acme Ultra last year", true],
  ["Acme Ultra", false, "about acme ultra", true],
  ["Acme Ultra", false, "the ACME-Ultra rollout", true],
  ["Acme Ultra", false, "Acme – Ultra, with a dash", true],
  ["Acme Ultra", false, "Acme\n  Ultra across a line break", true],
  ["Acme Ultra", false, "(Acme Ultra)", true],
  ["Acme Ultra", false, "AcmeUltra joined", false],
  ["Acme Ultra", false, "two Acme Ultras", false],
  ["Acme Ultra", false, "xAcme Ultra", false],
  ["ZQX", true, "the ZQX team", true],
  ["ZQX", true, "a ZQX-based design", true],
  ["ZQX", true, "zqx in lower case", false],
  ["ZQX", true, "ZQXs plural", false],
  ["a.b", false, "axb is not a.b", true],
  ["a.b", false, "only axb here", false],
];

void describe("matching rules (shared with the wiki)", () => {
  for (const [name, caseSensitive, text, expected] of MATCHING_CASES) {
    void it(`${name} in ${JSON.stringify(text)} → ${expected}`, () => {
      const found = findConfidentialNames(
        [entry(name, { caseSensitive })],
        text,
      );
      assert.equal(found.length > 0, expected);
    });
  }

  void it("never reports a public or unscanned name", () => {
    const names = [
      entry("Acme Ultra", { public: true }),
      entry("Acme Lite", { scan: false }),
    ];
    assert.deepEqual(
      findConfidentialNames(names, "Acme Ultra and Acme Lite"),
      [],
    );
  });
});

void describe("the list is parsed strictly", () => {
  const valid =
    "schema: 1\nnames:\n  - {name: Acme Ultra, product: acme, public: false}\n";

  void it("reads a valid list", () => {
    const names = parseConfidentialNames(valid);
    assert.deepEqual(names, [
      {
        name: "Acme Ultra",
        product: "acme",
        public: false,
        caseSensitive: false,
        scan: true,
      },
    ]);
  });

  const malformed: [string, string, RegExp][] = [
    ["empty names", "schema: 1\nnames: []\n", /non-empty/],
    [
      "no schema",
      "names:\n  - {name: X, product: p, public: false}\n",
      /schema: 1/,
    ],
    [
      "public missing",
      "schema: 1\nnames:\n  - {name: X, product: p}\n",
      /`public` is required/,
    ],
    [
      "public as text",
      "schema: 1\nnames:\n  - {name: X, product: p, public: 'no'}\n",
      /true or false/,
    ],
    [
      "misspelled flag",
      "schema: 1\nnames:\n  - {name: X, product: p, public: false, case_sensitve: true}\n",
      /unknown field/,
    ],
    [
      "unscanned without why",
      "schema: 1\nnames:\n  - {name: X, product: p, public: false, scan: false}\n",
      /needs a `why`/,
    ],
    [
      "nothing checked",
      "schema: 1\nnames:\n  - {name: X, product: p, public: true}\n",
      /no entry is checked/,
    ],
    [
      "duplicate",
      "schema: 1\nnames:\n  - {name: X, product: p, public: false}\n  - {name: x, product: p, public: false}\n",
      /listed twice/,
    ],
    ["not yaml", "schema: [1\n", /not valid YAML/],
  ];
  for (const [label, source, message] of malformed) {
    void it(`refuses a list with ${label}`, () => {
      // Half-parsing would check against part of the list and report clean.
      assert.throws(
        () => parseConfidentialNames(source),
        (err: unknown) => {
          assert.ok(err instanceof ConfidentialNamesError);
          assert.match(err.message, message);
          return true;
        },
      );
    });
  }
});

void describe("the gate", () => {
  void it("refuses a card whose Short Version names an unannounced product", () => {
    // The 2026-10-11 shape: opted in, reviewed, the name in the embedded section.
    const verdict = inspectInterviewCard(
      "strategy",
      card([
        [
          "Short Version",
          "With Acme Ultra, clear non-goals made it defensible.",
        ],
      ]),
      NAMES,
    );
    assert.equal(verdict.eligible, false);
    if (!verdict.eligible) {
      assert.equal(verdict.reason, "confidential-name");
      assert.deepEqual(verdict.confidentialMatches, ["Acme Ultra"]);
    }
  });

  void it("checks the question too — it is embedded with the answer", () => {
    const verdict = inspectInterviewCard(
      "q",
      card(
        [["Short Version", "A clean answer."]],
        "What did you learn on the ZQX launch?",
      ),
      NAMES,
    );
    assert.equal(verdict.eligible, false);
  });

  void it("does not read the private sections, which are never embedded", () => {
    const verdict = inspectInterviewCard(
      "notes",
      card([
        [
          "Short Version",
          "On a secure offering I advised on, non-goals came first.",
        ],
        [
          "Evidence Notes",
          "- Acme Ultra: the offering, never named in the answer",
        ],
        [
          "Long Version",
          "Acme Ultra in the spoken version, which JackGPT does not embed",
        ],
      ]),
      NAMES,
    );
    assert.equal(verdict.eligible, true);
  });

  void it("lets an announced name through", () => {
    const verdict = inspectInterviewCard(
      "launched",
      card([["Short Version", "Beacon shipped in 2024."]]),
      NAMES,
    );
    assert.equal(verdict.eligible, true);
  });

  void it("returns refused cards separately so the ingest can withdraw them", () => {
    const { cards, withheld } = judgeInterviewBank(
      [
        { slug: "clean", source: card([["Short Version", "A clean answer."]]) },
        {
          slug: "named",
          source: card([["Answer Draft", "Acme Ultra set the bar."]]),
        },
        {
          slug: "opted-out",
          source: card([["Short Version", "Acme Ultra"]]).replace(
            "publish_to_jackgpt: true\n",
            "",
          ),
        },
      ],
      NAMES,
    );
    assert.deepEqual(
      cards.map((c) => c.slug),
      ["clean"],
    );
    // An opted-out card is the sweep's business, not a confidentiality refusal.
    assert.deepEqual(withheld, [{ slug: "named", matches: ["Acme Ultra"] }]);
  });
});

function fakeDeps(existing: Set<string>, failOn: string | null = null) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      hasDocument: async (docId: string) => existing.has(docId),
      deleteChunks: async (docId: string) => {
        if (docId === failOn) throw new Error("delete failed");
        calls.push(`delete ${docId}`);
      },
      markWithdrawn: async (docId: string, reason: string) => {
        calls.push(`mark ${docId} ${reason}`);
      },
    },
  };
}

void describe("withdrawing a card an earlier run published", () => {
  void it("deletes the chunks, then marks the document", async () => {
    const { calls, deps } = fakeDeps(new Set(["doc-named"]));
    const outcomes = await withdrawWithheldCards(
      [{ slug: "named", matches: ["Acme Ultra"] }],
      (slug) => `doc-${slug}`,
      deps,
    );
    // Order matters: if the mark failed after a delete, nothing is retrievable either way.
    assert.deepEqual(calls, [
      "delete doc-named",
      `mark doc-named ${WITHHELD_REASON}`,
    ]);
    assert.deepEqual(outcomes, [
      { slug: "named", docId: "doc-named", withdrawn: true, error: null },
    ]);
  });

  void it("touches nothing for a card that was never published", async () => {
    const { calls, deps } = fakeDeps(new Set());
    const outcomes = await withdrawWithheldCards(
      [{ slug: "fresh", matches: ["ZQX"] }],
      (slug) => `doc-${slug}`,
      deps,
    );
    assert.deepEqual(calls, []);
    assert.equal(outcomes[0]?.withdrawn, false);
    assert.equal(outcomes[0]?.error, null);
  });

  void it("reports a failed withdrawal instead of swallowing it", async () => {
    const { deps } = fakeDeps(new Set(["doc-a", "doc-b"]), "doc-a");
    const outcomes = await withdrawWithheldCards(
      [
        { slug: "a", matches: ["Acme Ultra"] },
        { slug: "b", matches: ["Acme Ultra"] },
      ],
      (slug) => `doc-${slug}`,
      deps,
    );
    assert.equal(outcomes[0]?.error, "delete failed");
    assert.equal(
      outcomes[1]?.withdrawn,
      true,
      "one failure must not stop the rest",
    );
  });
});

void describe("the list is read from the wiki, and nothing publishes without it", () => {
  const realFetch = globalThis.fetch;
  const realToken = process.env.INTERVIEW_BANK_GITHUB_TOKEN;

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realToken === undefined) delete process.env.INTERVIEW_BANK_GITHUB_TOKEN;
    else process.env.INTERVIEW_BANK_GITHUB_TOKEN = realToken;
  });

  const LIST =
    "schema: 1\nnames:\n  - {name: Acme Ultra, product: acme, public: false}\n";

  function stubGithub(listResponse: () => Response) {
    process.env.INTERVIEW_BANK_GITHUB_TOKEN = "test-token";
    const requests: { url: string; accept: string | null }[] = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const accept = new Headers(init?.headers).get("accept");
      requests.push({ url, accept });
      if (url.includes("confidential-names.yaml")) return listResponse();
      if (url.includes("/contents/interview-prep/questions")) {
        return Response.json([
          {
            name: "named.md",
            type: "file",
            download_url: "https://raw.example/named.md",
          },
          {
            name: "clean.md",
            type: "file",
            download_url: "https://raw.example/clean.md",
          },
        ]);
      }
      if (url.endsWith("named.md")) {
        return new Response(card([["Short Version", "Acme Ultra did it."]]));
      }
      if (url.endsWith("clean.md"))
        return new Response(card([["Short Version", "Fine."]]));
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    return requests;
  }

  void it("fetches the list raw from the same private repo, and applies it", async () => {
    const requests = stubGithub(() => new Response(LIST));
    const { cards, withheld } = await fetchInterviewBankCards();
    assert.deepEqual(
      cards.map((c) => c.slug),
      ["clean"],
    );
    assert.deepEqual(withheld, [{ slug: "named", matches: ["Acme Ultra"] }]);

    const listRequest = requests.find((r) =>
      r.url.includes("confidential-names.yaml"),
    );
    assert.ok(listRequest);
    assert.match(
      listRequest.url,
      /api\.github\.com\/repos\/jack-h-park\/product-management-wiki\/contents\/wiki\/persona\/confidential-names\.yaml\?ref=main/,
    );
    assert.equal(listRequest.accept, "application/vnd.github.raw");
  });

  void it("the preview shows the refusal and the words that caused it", async () => {
    stubGithub(() => new Response(LIST));
    const preview = await previewInterviewBank();
    const named = preview.entries.find((e) => e.slug === "named");
    assert.equal(named?.reason, "confidential-name");
    assert.deepEqual(named?.confidentialMatches, ["Acme Ultra"]);
    assert.equal(
      named?.text,
      null,
      "a refused card's text is not offered as publishable",
    );
    assert.equal(preview.eligible, 1);
  });

  void it("fails the run when the list cannot be read", async () => {
    stubGithub(
      () => new Response("missing", { status: 404, statusText: "Not Found" }),
    );
    await assert.rejects(
      fetchInterviewBankCards(),
      /confidential-names list .* 404/,
    );
    await assert.rejects(previewInterviewBank(), /not published unchecked/);
  });

  void it("fails the run when the list is malformed", async () => {
    stubGithub(() => new Response("schema: 1\nnames: []\n"));
    await assert.rejects(fetchInterviewBankCards(), ConfidentialNamesError);
  });
});
