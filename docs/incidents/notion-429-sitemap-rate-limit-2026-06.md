# Notion 429 Rate Limit — Sitemap over-fetch incident (2026-06)

## Summary

Dev server started returning 500 / 404 on every page load immediately after
`bdb1b51` ("fix: use lib/notion.ts getPage in getSiteMap to populate
collection_query") landed. Root cause was a single-line import swap that
multiplied Notion API calls per sitemap page by 5–10×, reliably exhausting
the unofficial Notion API's rate limit on every server start.

---

## Root cause

`get-site-map.ts` uses `getAllPagesInSpace` (notion-utils) to discover all
pages in the workspace. That function accepts a `getPage` callback which it
calls once per discovered page.

| Commit | `getPage` implementation | API calls per page |
|---|---|---|
| Before `bdb1b51` | `notion.getPage()` directly — minimal fetch | ~1 |
| After `bdb1b51` | `loadPageFromNotion()` from `lib/notion.ts` | ~5–10 |

`loadPageFromNotion` does far more than page discovery needs:

```
notion.getPage({ fetchCollections, fetchMissingBlocks, fetchRelationPages })
  + fetchCollectionCardCalloutChildren   ← extra API calls per card
  + getNavigationLinkPages               ← extra API calls for nav
  + getPreviewImageMap                   ← extra API calls per image
  + getTweetsMap                         ← extra API calls per tweet
```

With the default `concurrency: 4` in `getAllPagesInSpace` and ~50 pages in
the workspace, a single server start went from ~50 API calls to ~250–500.
The unofficial Notion API (`notion.site/api/v3`) has a strict rate limit
window of several minutes, so these bursts triggered 429 on startup and the
server never recovered within the retry window.

### Why it wasn't caught earlier

`bdb1b51` was motivated by a legitimate bug: the old lightweight `getPage`
did not run `hydrateGroupedCollectionData`, so `collection_query` was never
populated and `getAllPagesInSpace` never discovered collection-database items.
The trade-off (more API calls) was not visible in local testing because the
rate limit hadn't been hit yet.

---

## Fix

### 1. Reverted `getPage` in `get-site-map.ts` to a lightweight fetch

```ts
// lib/get-site-map.ts
const getPage = async (pageId: string) => {
  const recordMap = await notion.getPage(pageId, {
    fetchCollections: true,   // needed for collection_query hydration
    fetchMissingBlocks: false, // not needed for traversal
    fetchRelationPages: false, // not needed for traversal
    ofetchOptions: { timeout: 30_000 },
  });
  return normalizeBlocksForTraversal(recordMap);
};
```

`fetchCollections: true` preserves the collection discovery that `bdb1b51`
needed, without pulling in the rendering-only extras.

### 2. Added 429 retry with exponential backoff in `loadPageFromNotion`

```ts
// lib/notion.ts — loadPageFromNotion
// Retries up to 3 times: wait 2 s then 4 s before giving up.
```

Applies to all full page loads (individual page routes), not just sitemap.
Sitemap traversal is unaffected because it no longer calls `loadPageFromNotion`.

### 3. Added disk-based sitemap cache

```ts
// lib/get-site-map.ts
// Cache path: .next/cache/notion-sitemap.json
// TTL: 5 min in development, 60 min in production
```

Prevents repeated server restarts from re-fetching the full sitemap from
Notion. On cache hit the Notion API is not called at all for sitemap
generation.

### 4. Reduced sitemap concurrency to 1

```ts
getAllPagesInSpace(rootId, spaceId, getPage, { concurrency: 1 })
```

Prevents multiple simultaneous Notion calls during sitemap traversal. Sitemap
generation is a one-time startup cost; the extra latency is acceptable.

### 5. Graceful skip on sitemap page load failure

```ts
if (!recordMap) {
  console.warn(`Skipping page "${pageId}" — recordMap unavailable`);
  return map;
}
```

A failed page (any error, including 429) is skipped rather than aborting the
entire sitemap. The page will be missing from the sitemap until the next
successful fetch, but other pages remain accessible.

### 6. `devIndicators: false` in `next.config.js`

Next.js 15 ships a pre-bundled `next-devtools` overlay
(`node_modules/next/dist/compiled/next-devtools/index.js`) with React bundled
inside it. This creates a second React instance that is not reachable by
webpack aliases at runtime. When the dev overlay renders it triggers:

```
TypeError: Cannot read properties of null (reading 'useContext')
```

Disabling `devIndicators` prevents the overlay from being rendered and
eliminates the error. This is a Next.js 15 bug; the fix is cosmetic
(dev-only indicator lost) with no impact on app behavior.

---

## Files changed

| File | Change |
|---|---|
| `lib/get-site-map.ts` | Reverted `getPage` to lightweight fetch; added disk cache; added graceful skip; added `concurrency: 1` |
| `lib/notion.ts` | Added 429 retry with exponential backoff in `loadPageFromNotion` |
| `next.config.js` | Added `devIndicators: false` |

---

## Regression checks

1. Start dev server fresh (no `.next/cache/notion-sitemap.json`).
   - First load: sitemap is fetched; `GET / 200` within ~15 s.
   - No 429 errors in server logs.
2. Restart dev server without clearing cache.
   - `[sitemap cache] hit — skipping Notion API fetch` appears in logs.
   - `GET / 200` within ~5 s.
3. Navigate to an inline-database sub-page (e.g. a blog post in a gallery
   collection). It should resolve correctly — confirming `fetchCollections: true`
   is sufficient for collection discovery.
4. If an inline-database page URL is broken (404), that indicates
   `hydrateGroupedCollectionData` is required beyond `fetchCollections: true`
   and the lightweight fetch must be revisited.

---

## Known trade-off / watch point

The `bdb1b51` motivation was valid: `hydrateGroupedCollectionData` is the
only code path that fully populates `collection_query` for grouped collection
views. The current lightweight fetch uses `fetchCollections: true` which
populates `collection_query` at a basic level, but may miss grouped/board
layouts that require the hydration step.

**If inline-database pages stop resolving after this fix**, the correct
long-term solution is to extract `hydrateGroupedCollectionData` as a separate
exported function in `lib/notion.ts` and call it from the sitemap `getPage`
callback — without pulling in `previewImages`, `tweets`, or navigation links.
