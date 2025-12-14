import { type NextApiRequest, type NextApiResponse } from "next";

import type * as types from "../../lib/types";
import { notionLogger } from "../../lib/logging/logger";
import { search } from "../../lib/notion";

export default async function searchNotion(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).send({ error: "method not allowed" });
  }

  const searchParams: types.SearchParams = req.body;

  notionLogger.debug("lambda search-notion input", { searchParams });
  const results = await search(searchParams);
  notionLogger.debug("lambda search-notion output", {
    resultCount: results.results.length,
    total: results.total,
  });

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, max-age=60, stale-while-revalidate=60",
  );
  res.status(200).json(results);
}
