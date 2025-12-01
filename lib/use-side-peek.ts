import * as React from "react";

import type * as types from "@/lib/types";

type SidePeekCacheKey = string;

type SidePeekCachedValue = {
  recordMap: types.ExtendedRecordMap;
};

const sidePeekCache = new Map<SidePeekCacheKey, SidePeekCachedValue>();

export function useSidePeek() {
  const [isPeekOpen, setIsPeekOpen] = React.useState(false);
  const [peekPageId, setPeekPageId] = React.useState<string | null>(null);
  const [peekRecordMap, setPeekRecordMap] =
    React.useState<types.ExtendedRecordMap | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleOpenPeek = React.useCallback((pageId: string) => {
    setPeekPageId(pageId);
    setIsPeekOpen(true);
  }, []);

  const handleClosePeek = React.useCallback(() => {
    setIsPeekOpen(false);
    setPeekPageId(null);
    setPeekRecordMap(null);
  }, []);

  React.useEffect(() => {
    if (!peekPageId) return;

    const cacheKey = JSON.stringify({ pageId: peekPageId, view: "side-peek" });
    const cached = sidePeekCache.get(cacheKey);

    if (cached) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[useSidePeek] HIT", cacheKey);
      }
      setPeekRecordMap(cached.recordMap);
      setIsLoading(false);
      return;
    } else if (process.env.NODE_ENV !== "production") {
      console.log("[useSidePeek] MISS", cacheKey);
    }

    const fetchPeekPage = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/notion?id=${peekPageId}`);
        if (!res.ok) throw new Error("Failed to fetch peek page");
        const data = (await res.json()) as {
          recordMap: types.ExtendedRecordMap;
        };
        setPeekRecordMap(data.recordMap || null);
        if (data.recordMap) {
          sidePeekCache.set(cacheKey, { recordMap: data.recordMap });
        }
      } catch (err) {
        console.error("[SidePeek fetch error]", err);
        handleClosePeek();
      } finally {
        setIsLoading(false);
      }
    };

    void fetchPeekPage();
  }, [peekPageId, handleClosePeek]);

  return {
    isPeekOpen,
    peekRecordMap,
    isLoading,
    handleOpenPeek,
    handleClosePeek,
  };
}
