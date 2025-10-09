import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import { mergeRecordMaps } from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'

import {
  environment,
  isPreviewImageSupportEnabled,
  navigationLinks,
  navigationStyle,
  notionPageCacheKeyPrefix,
  notionPageCacheTTL,
  isNotionPageCacheEnabled
} from './config'
import { db } from './db'
import { getTweetsMap } from './get-tweets'
import { notion } from './notion-api'
import { getPreviewImageMap } from './preview-images'

const getNavigationLinkPages = pMemoize(
  async (): Promise<ExtendedRecordMap[]> => {
    const navigationLinkPageIds = (navigationLinks || [])
      .map((link) => link?.pageId)
      .filter(Boolean)

    if (navigationStyle !== 'default' && navigationLinkPageIds.length) {
      return pMap(
        navigationLinkPageIds,
        async (navigationLinkPageId) =>
          notion.getPage(navigationLinkPageId, {
            chunkLimit: 1,
            fetchMissingBlocks: false,
            fetchCollections: false,
            signFileUrls: false
          }),
        {
          concurrency: 4
        }
      )
    }

    return []
  }
)

const inFlightPageFetches = new Map<string, Promise<ExtendedRecordMap>>()

type MemoryCacheEntry = {
  recordMap: ExtendedRecordMap
  expiresAt: number
}

const memoryPageCache = new Map<string, MemoryCacheEntry>()

const getPageCacheKey = (pageId: string) => {
  const normalizedId = pageId.replace(/-/g, '')
  return `${notionPageCacheKeyPrefix}:${environment}:${normalizedId}`
}

const getCacheExpiry = () =>
  typeof notionPageCacheTTL === 'number'
    ? Date.now() + notionPageCacheTTL
    : Date.now()

const getCachedRecordMapFromMemory = (cacheKey: string) => {
  const entry = memoryPageCache.get(cacheKey)
  if (!entry) {
    return null
  }

  if (typeof notionPageCacheTTL === 'number' && Date.now() > entry.expiresAt) {
    memoryPageCache.delete(cacheKey)
    return null
  }

  return entry.recordMap
}

const setCachedRecordMapInMemory = (
  cacheKey: string,
  recordMap: ExtendedRecordMap
) => {
  if (!isNotionPageCacheEnabled) {
    return
  }

  memoryPageCache.set(cacheKey, {
    recordMap,
    expiresAt: getCacheExpiry()
  })
}

const readCachedRecordMap = async (
  cacheKey: string
): Promise<ExtendedRecordMap | null> => {
  if (!isNotionPageCacheEnabled) {
    return null
  }

  try {
    const cached = (await db.get(cacheKey)) as ExtendedRecordMap | undefined
    if (cached) {
      setCachedRecordMapInMemory(cacheKey, cached)
      return cached
    }
  } catch (err: any) {
    console.warn(`redis error get "${cacheKey}"`, err.message)
  }

  return null
}

const writeCachedRecordMap = async (
  cacheKey: string,
  recordMap: ExtendedRecordMap
) => {
  if (!isNotionPageCacheEnabled) {
    return
  }

  try {
    if (typeof notionPageCacheTTL === 'number') {
      await db.set(cacheKey, recordMap, notionPageCacheTTL)
    } else {
      await db.set(cacheKey, recordMap)
    }
    setCachedRecordMapInMemory(cacheKey, recordMap)
  } catch (err: any) {
    console.warn(`redis error set "${cacheKey}"`, err.message)
  }
}

const loadPageFromNotion = async (
  pageId: string
): Promise<ExtendedRecordMap> => {
  let recordMap = await notion.getPage(pageId)

  if (navigationStyle !== 'default') {
    const navigationLinkRecordMaps = await getNavigationLinkPages()

    if (navigationLinkRecordMaps?.length) {
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap) =>
          mergeRecordMaps(map, navigationLinkRecordMap),
        recordMap
      )
    }
  }

  if (isPreviewImageSupportEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap)
    ;(recordMap as any).preview_images = previewImageMap
  }

  await getTweetsMap(recordMap)

  return recordMap
}

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  const cacheKey = getPageCacheKey(pageId)

  if (isNotionPageCacheEnabled) {
    const memoryCached = getCachedRecordMapFromMemory(cacheKey)
    if (memoryCached) {
      return memoryCached
    }

    const persistentCached = await readCachedRecordMap(cacheKey)
    if (persistentCached) {
      return persistentCached
    }
  }

  const existingFetch = inFlightPageFetches.get(cacheKey)

  if (existingFetch) {
    return existingFetch
  }

  const fetchPromise = (async () => {
    const recordMap = await loadPageFromNotion(pageId)

    await writeCachedRecordMap(cacheKey, recordMap)

    return recordMap
  })()

  inFlightPageFetches.set(cacheKey, fetchPromise)

  try {
    return await fetchPromise
  } finally {
    inFlightPageFetches.delete(cacheKey)
  }
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}
