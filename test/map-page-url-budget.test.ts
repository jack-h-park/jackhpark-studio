import assert from "node:assert/strict";
import test from "node:test";

import type { ExtendedRecordMap } from "notion-types";

import { site } from "@/lib/config";
import { mapPageUrl } from "@/lib/map-page-url";

void test("one mapper inverts the canonical map once across multiple links", () => {
  let enumerations = 0;
  const pages = new Proxy(
    {
      alpha: "28299029-c0b4-81ce-8999-d425287d3db6",
      beta: "28299029-c0b4-81ce-8999-d425287d3db7",
    },
    {
      ownKeys(target) {
        enumerations++;
        return Reflect.ownKeys(target);
      },
    },
  );
  const testSite = {
    ...site,
    rootNotionPageId: "11111111111141118111111111111111",
  };
  const map = mapPageUrl(
    testSite,
    {} as ExtendedRecordMap,
    new URLSearchParams("lite=true"),
    pages,
  );
  assert.equal(map("28299029-c0b4-81ce-8999-d425287d3db6"), "/alpha?lite=true");
  assert.equal(map("28299029-c0b4-81ce-8999-d425287d3db7"), "/beta?lite=true");
  assert.equal(
    map("28299029-c0b4-81ce-8999-d425287d3db8"),
    "/28299029c0b481ce8999d425287d3db8?lite=true",
  );
  assert.equal(map(testSite.rootNotionPageId), "/studio?lite=true");
  assert.equal(enumerations, 1);
});
