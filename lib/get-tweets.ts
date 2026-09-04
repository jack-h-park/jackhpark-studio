import { type ExtendedRecordMap } from "notion-types";
import { getPageTweetIds } from "notion-utils";
import pMap from "p-map";
import pMemoize from "p-memoize";
import { getTweet as getTweetData } from "react-tweet/api";

import type { ExtendedTweetRecordMap } from "./types";
import { db } from "./db";
import { errorMessage } from "./error-message";

export async function getTweetsMap(
  recordMap: ExtendedRecordMap,
): Promise<void> {
  const tweetIds = getPageTweetIds(recordMap);

  const tweetsMap = Object.fromEntries(
    await pMap(
      tweetIds,
      async (tweetId: string) => {
        return [tweetId, await getTweet(tweetId)];
      },
      {
        concurrency: 8,
      },
    ),
  );

  (recordMap as ExtendedTweetRecordMap).tweets = tweetsMap;
}

async function getTweetImpl(tweetId: string): Promise<any> {
  if (!tweetId) return null;

  const cacheKey = `tweet:${tweetId}`;

  try {
    try {
      const cachedTweet = await db.get(cacheKey);
      if (cachedTweet || cachedTweet === null) {
        return cachedTweet;
      }
    } catch (err: unknown) {
      // ignore redis errors
      console.warn(`redis error get "${cacheKey}"`, errorMessage(err));
    }

    const tweetData = (await getTweetData(tweetId)) || null;

    try {
      await db.set(cacheKey, tweetData);
    } catch (err: unknown) {
      // ignore redis errors
      console.warn(`redis error set "${cacheKey}"`, errorMessage(err));
    }

    return tweetData;
  } catch (err: unknown) {
    console.warn("failed to get tweet", tweetId, errorMessage(err));
    return null;
  }
}

export const getTweet = pMemoize(getTweetImpl);
