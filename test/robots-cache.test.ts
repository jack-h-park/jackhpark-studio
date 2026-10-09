import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import test from "node:test";

import type { GetServerSidePropsContext } from "next";

import { getServerSideProps } from "@/pages/robots.txt";

void test("robots can be cached at the edge without allowing Preview indexing", async () => {
  const previous = process.env.VERCEL_ENV;
  try {
    for (const env of ["production", "preview"]) {
      process.env.VERCEL_ENV = env;
      const req = new IncomingMessage(new Socket());
      req.method = "GET";
      const res = new ServerResponse(req);
      const body: string[] = [];
      res.write = ((chunk: string) => {
        body.push(chunk);
        return true;
      }) as typeof res.write;
      res.end = (() => res) as typeof res.end;
      await getServerSideProps({ req, res } as GetServerSidePropsContext);
      assert.equal(
        res.getHeader("Cache-Control"),
        "public, max-age=0, s-maxage=86400",
      );
      assert.match(
        body.join(""),
        env === "production" ? /Allow: \// : /Disallow: \//,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
