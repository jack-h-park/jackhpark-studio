import assert from "node:assert/strict";
import test from "node:test";

import {
  type PreviewImageOutcome,
  summarizePreviewImageResults,
} from "@/lib/preview-images";

const BLUR = {
  originalWidth: 32,
  originalHeight: 32,
  dataURIBase64: "data:image/png;base64,AAAA",
};

const ok = (url: string): PreviewImageOutcome => ({ url, image: BLUR });
const failed = (url: string, reason: string): PreviewImageOutcome => ({
  url,
  image: null,
  reason,
});

void test("stays quiet when every placeholder was generated", () => {
  assert.equal(
    summarizePreviewImageResults([
      ok("https://www.notion.so/image/a.png"),
      ok("data:image/png;base64,AAAA"),
    ]),
    null,
  );
});

void test("escalates when every remote fetch failed", () => {
  // The shape observed in production: a large map whose only real entries were
  // the inline data: URIs, because every notion.so fetch had failed.
  const results: PreviewImageOutcome[] = [
    ...Array.from({ length: 131 }, (_, index) =>
      failed(
        `https://www.notion.so/image/attachment-${index}.png`,
        "TypeError / fetch failed / UND_ERR_CONNECT_TIMEOUT",
      ),
    ),
    ok("data:image/png;base64,AAAA"),
    ok("data:image/png;base64,BBBB"),
  ];

  const summary = summarizePreviewImageResults(results);

  assert.ok(summary);
  assert.equal(summary.severity, "total");
  assert.equal(summary.payload.total, 133);
  assert.equal(summary.payload.failed, 131);
  assert.equal(summary.payload.remoteTotal, 131);
  assert.equal(summary.payload.remoteFailed, 131);
  assert.deepEqual(summary.payload.reasons, {
    "TypeError / fetch failed / UND_ERR_CONNECT_TIMEOUT": 131,
  });
});

void test("a few expired urls stay informational, not an error", () => {
  const summary = summarizePreviewImageResults([
    ok("https://www.notion.so/image/a.png"),
    ok("https://www.notion.so/image/b.png"),
    failed("https://www.notion.so/image/expired.png", "HTTPError / 403"),
  ]);

  assert.ok(summary);
  assert.equal(summary.severity, "partial");
  assert.equal(summary.payload.remoteFailed, 1);
  assert.equal(summary.payload.remoteTotal, 3);
});

void test("failing data: uris alone never read as a total outage", () => {
  // Nothing remote was attempted, so there is no fetch to declare broken.
  const summary = summarizePreviewImageResults([
    failed("data:image/png;base64,AAAA", "Error / bad image"),
  ]);

  assert.ok(summary);
  assert.equal(summary.severity, "partial");
  assert.equal(summary.payload.remoteTotal, 0);
});

void test("groups distinct causes so one bad host does not hide another", () => {
  const summary = summarizePreviewImageResults([
    failed("https://www.notion.so/image/a.png", "TypeError / fetch failed"),
    failed("https://www.notion.so/image/b.png", "TypeError / fetch failed"),
    failed("https://www.notion.so/image/c.png", "HTTPError / 403"),
  ]);

  assert.ok(summary);
  assert.deepEqual(summary.payload.reasons, {
    "TypeError / fetch failed": 2,
    "HTTPError / 403": 1,
  });
});
