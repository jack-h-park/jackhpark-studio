import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

const question = {
  id: "q1",
  lang: "en" as const,
  kind: "project" as const,
  turns: [{ role: "user" as const, content: "What did Jack build?" }],
};

void test("buildFixture keeps the last streamed request and counts auxiliary calls", () => {
  const fixture = buildFixture(
    [question],
    [
      {
        label: "q1",
        seq: 1,
        body: {
          stream: false,
          messages: [{ role: "user", content: "rewrite this" }],
        },
      },
      {
        label: "q1",
        seq: 2,
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
    auxiliaryCalls: 1,
  });
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
