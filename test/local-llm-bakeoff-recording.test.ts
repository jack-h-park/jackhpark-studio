import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildFixture } from "@/scripts/local-llm-bakeoff/fixture.mjs";
import { assertOutsideRepo } from "@/scripts/local-llm-bakeoff/private-path.mjs";
import {
  startRecorder,
  STUB_ANSWER,
} from "@/scripts/local-llm-bakeoff/recorder.mjs";
import { readJsonl } from "@/scripts/local-llm-bakeoff/results-store.mjs";

void test("the recorder logs labelled requests and answers with the stub", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-rec-"));
  const recorder = await startRecorder({
    port: 0,
    logPath: join(dir, "log.jsonl"),
  });
  try {
    await fetch(`${recorder.url}/__label`, {
      method: "POST",
      body: JSON.stringify({ label: "q1" }),
    });
    const streamed = await fetch(`${recorder.url}/v1/chat/completions`, {
      method: "POST",
      body: JSON.stringify({
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    assert.ok((await streamed.text()).includes(STUB_ANSWER));
    const plain = await fetch(`${recorder.url}/v1/chat/completions`, {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "rewrite" }],
      }),
    });
    const payload = (await plain.json()) as {
      choices: { message: { content: string } }[];
    };
    assert.equal(payload.choices[0]?.message.content, STUB_ANSWER);
    const log = await readJsonl(join(dir, "log.jsonl"));
    assert.deepEqual(
      log.map((row) => [row.label, row.seq]),
      [
        ["q1", 1],
        ["q1", 2],
      ],
    );
  } finally {
    await recorder.close();
    await rm(dir, { recursive: true, force: true });
  }
});

void test("the recorder starts a fresh log instead of appending to a stale one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bakeoff-rec-"));
  const logPath = join(dir, "log.jsonl");
  await writeFile(
    logPath,
    `${JSON.stringify({ label: "stale", seq: 41, body: {} })}\n`,
  );
  const recorder = await startRecorder({ port: 0, logPath });
  try {
    await fetch(`${recorder.url}/__label`, {
      method: "POST",
      body: JSON.stringify({ label: "q1" }),
    });
    await fetch(`${recorder.url}/v1/chat/completions`, {
      method: "POST",
      body: JSON.stringify({
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const log = await readJsonl(logPath);
    assert.deepEqual(
      log.map((row) => [row.label, row.seq]),
      [["q1", 1]],
    );
  } finally {
    await recorder.close();
    await rm(dir, { recursive: true, force: true });
  }
});

const question = {
  id: "q1",
  lang: "en" as const,
  kind: "project" as const,
  turns: [{ role: "user" as const, content: "What did Jack build?" }],
};

void test("buildFixture keeps the single streamed request with no auxiliary calls", () => {
  const fixture = buildFixture(
    [question],
    [
      {
        label: "q1",
        seq: 1,
        body: {
          stream: true,
          temperature: 0.3,
          max_tokens: 700,
          messages: [
            { role: "system", content: "Context: ..." },
            { role: "user", content: "What did Jack build?" },
          ],
        },
      },
    ],
  );
  assert.deepEqual(fixture.items[0], {
    id: "q1",
    lang: "en",
    kind: "project",
    messages: [
      { role: "system", content: "Context: ..." },
      { role: "user", content: "What did Jack build?" },
    ],
    temperature: 0.3,
    maxTokens: 700,
    auxiliaryCalls: 0,
  });
});

function streamed(label: string, seq: number, content: string) {
  return {
    label,
    seq,
    body: {
      stream: true,
      messages: [{ role: "user", content }],
    },
  };
}

void test("buildFixture refuses items whose recorded input was built from stub answers", () => {
  const other = {
    id: "q2",
    lang: "en" as const,
    kind: "project" as const,
    turns: [{ role: "user" as const, content: "Where did Jack work?" }],
  };
  const third = {
    id: "q3",
    lang: "en" as const,
    kind: "project" as const,
    turns: [{ role: "user" as const, content: "What is JackGPT?" }],
  };
  assert.throws(
    () =>
      buildFixture(
        [question, other, third],
        [
          {
            label: "q1",
            seq: 1,
            body: {
              stream: false,
              messages: [{ role: "user", content: "rewrite this" }],
            },
          },
          streamed("q1", 2, "What did Jack build?"),
          streamed("q2", 3, "Where did Jack work?"),
          {
            label: "q3",
            seq: 4,
            body: {
              stream: false,
              messages: [{ role: "user", content: "summarize history" }],
            },
          },
          streamed("q3", 5, "What is JackGPT?"),
        ],
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("q1, q3") &&
      !error.message.includes("q2") &&
      error.message.includes(
        "the app made extra model calls (query rewrite, HyDE or history summary) that the recorder answered with a stub, so the recorded input is not production input; disable those features for the recording session or record these items another way",
      ),
  );
});

void test("buildFixture refuses a question the app never sent to the recorder", () => {
  assert.throws(
    () => buildFixture([question], []),
    /no streamed request recorded for q1/,
  );
});

void test("buildFixture refuses a request that does not end with the question", () => {
  assert.throws(
    () =>
      buildFixture(
        [question],
        [
          {
            label: "q1",
            seq: 1,
            body: {
              stream: true,
              messages: [{ role: "user", content: "other" }],
            },
          },
        ],
      ),
    /does not end with its question/,
  );
});

void test("buildFixture refuses a message whose content is not a string", () => {
  assert.throws(
    () =>
      buildFixture(
        [question],
        [
          {
            label: "q1",
            seq: 1,
            body: {
              stream: true,
              messages: [
                { role: "system", content: [{ type: "text", text: "ctx" }] },
                { role: "user", content: "What did Jack build?" },
              ],
            },
          },
        ],
      ),
    /recorded message in q1 has non-string content/,
  );
});

void test("private data paths must sit outside the repository", () => {
  assert.throws(
    () => assertOutsideRepo("/repo/data", "/repo"),
    /inside the repository/,
  );
  assert.throws(
    () => assertOutsideRepo("/repo", "/repo"),
    /inside the repository/,
  );
  assert.doesNotThrow(() => assertOutsideRepo("/private/bakeoff", "/repo"));
  assert.doesNotThrow(() => assertOutsideRepo("/repo-data", "/repo"));
});
