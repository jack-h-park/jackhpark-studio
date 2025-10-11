import {
  type CollectionView,
  type ExtendedRecordMap,
  type Role,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import { mergeRecordMaps } from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'

import {
  environment,
  isNotionPageCacheEnabled,
  isPreviewImageSupportEnabled,
  navigationLinks,
  navigationStyle,
  notionPageCacheKeyPrefix,
  notionPageCacheTTL} from './config'
import { db } from './db'
import { getTweetsMap } from './get-tweets'
import { notion } from './notion-api'
import { getPreviewImageMap } from './preview-images'

const normalizeGroupValue = (group: any) => {
  if (!group || typeof group !== 'object') return group

  const normalized = { ...group }
  const groupValue = normalized.value

  if (
    groupValue &&
    typeof groupValue === 'object' &&
    'value' in groupValue &&
    groupValue.value &&
    typeof (groupValue as any).value === 'object'
  ) {
    const inner = (groupValue as any).value

    if (typeof inner === 'string') {
      return normalized
    }

    if (inner && typeof inner === 'object' && 'group' in inner) {
      normalized.value = {
        ...groupValue,
        value: inner.group
      }
    } else if (inner && typeof inner === 'object' && 'value' in inner) {
      normalized.value = {
        ...groupValue,
        value: inner.value
      }
    }
  }

  return normalized
}

const sanitizeCollectionViewForGrouping = (viewValue: any) => {
  if (!viewValue || typeof viewValue !== 'object') {
    return viewValue
  }

  const format = viewValue.format
  if (!format || typeof format !== 'object') {
    return viewValue
  }

  const patchedFormat: any = { ...format }

  let collectionId:
    | string
    | undefined = viewValue.collection_id ?? (viewValue as any).collectionId

  const pointer =
    (viewValue as any).collection_pointer ?? (format as any).collection_pointer
  if (!collectionId && pointer && typeof pointer === 'object') {
    collectionId = pointer.id ?? pointer.collectionId ?? pointer.collection_id
  }

  if (Array.isArray(format.collection_groups)) {
    patchedFormat.collection_groups = format.collection_groups.map(
      normalizeGroupValue
    )
  }

  if (Array.isArray(format.board_columns)) {
    patchedFormat.board_columns = format.board_columns.map(
      normalizeGroupValue
    )
  }

  const sanitized = {
    ...viewValue,
    collection_id: collectionId ?? viewValue.collection_id,
    format: patchedFormat
  }

  if (!sanitized.collection_id) {
    console.warn('[grouped-collection] missing collection id from view', {
      viewId: viewValue?.id,
      pointer
    })
  }

  return sanitized
}

const sanitizeForJSON = (value: any): any => {
  if (value === undefined) {
    return null
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJSON(item))
  }

  if (value && typeof value === 'object') {
    const output: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      const sanitized = sanitizeForJSON(val)
      if (sanitized !== undefined) {
        output[key] = sanitized
      }
    }
    return output
  }

  return value
}

const hasGroupedBlocks = (entry: any): boolean => {
  if (!entry || typeof entry !== 'object') return false

  const collectionGroupResults = entry.collection_group_results
  if (collectionGroupResults && Array.isArray(collectionGroupResults.blockIds)) {
    if (collectionGroupResults.blockIds.length > 0) {
      return true
    }
  }

  const bucketSources: Array<Record<string, any> | undefined> = [
    entry.reducerResults,
    entry.reducers
  ]

  for (const source of bucketSources) {
    if (!source || typeof source !== 'object') continue
    for (const value of Object.values(source)) {
      const blockIds = (value as any)?.blockIds
      if (Array.isArray(blockIds) && blockIds.length > 0) {
        return true
      }
    }
  }

  return false
}

const mergeCollectionQuery = (
  target: any,
  source: any,
  collectionId: string,
  viewId: string
) => {
  if (!source) {
    return target
  }

  const clone = {
    ...target,
    collection_query: {
      ...target?.collection_query
    }
  }

  if (!clone.collection_query[collectionId]) {
    clone.collection_query[collectionId] = {}
  }

  const existing = clone.collection_query[collectionId][viewId] ?? {}
  clone.collection_query[collectionId][viewId] = sanitizeForJSON({
    ...existing,
    ...source
  })

  return clone
}

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
  const normalizedId = pageId.replaceAll('-', '')
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

const hydrateGroupedCollectionData = async (
  recordMap: ExtendedRecordMap
): Promise<ExtendedRecordMap> => {
  const collectionViews = recordMap.collection_view

  if (!collectionViews) {
    return recordMap
  }

  const targets = Object.entries(collectionViews)
    .map(([viewId, view]) => {
      if (!view || typeof view !== 'object') {
        return null
      }

      const typedView = view as { role: Role; value: CollectionView }
      const rawView = typedView.value
      if (!rawView) return null

      const sanitizedView = sanitizeCollectionViewForGrouping(rawView)
      recordMap.collection_view[viewId] = {
        ...typedView,
        value: sanitizedView
      }
      const collectionId = sanitizedView?.collection_id as string | undefined
      const format = sanitizedView?.format

      if (!collectionId) {
        return null
      }

      const hasGrouping =
        Boolean(format?.collection_group_by) ||
        Boolean(format?.board_columns_by) ||
        (Array.isArray(format?.collection_groups) &&
          format.collection_groups.length > 0) ||
        (Array.isArray(format?.board_columns) &&
          format.board_columns.length > 0)

      if (!hasGrouping) {
        return null
      }

      const existingEntry =
        recordMap.collection_query?.[collectionId]?.[viewId] ?? null

      if (hasGroupedBlocks(existingEntry)) {
        return null
      }

      console.debug('[grouped-collection] hydration scheduled', {
        viewId,
        collectionId,
        viewType: sanitizedView?.type,
        hasGrouping,
        hasExistingResult: Boolean(existingEntry)
      })

      return {
        viewId,
        collectionId,
        viewValue: sanitizedView
      }
    })
    .filter(Boolean) as Array<{
      viewId: string
      collectionId: string
      viewValue: any
    }>

  if (!targets.length) {
    return recordMap
  }

  await pMap(
    targets,
    async ({ viewId, collectionId, viewValue }) => {
      try {
        const data = await notion.getCollectionData(
          collectionId,
          viewId,
          viewValue,
          {
            limit: 999
          }
        )

        if (data?.recordMap) {
          recordMap = mergeRecordMaps(recordMap, data.recordMap as any)

          const fetchedEntry = (
            data.recordMap as ExtendedRecordMap
          ).collection_query?.[collectionId]?.[viewId]
          if (fetchedEntry) {
            recordMap = mergeCollectionQuery(
              recordMap,
              fetchedEntry,
              collectionId,
              viewId
            )
          }
        }

        if (data?.result) {
          const reducerResults = data.result.reducerResults as
            | Record<string, any>
            | undefined

          let normalizedResult = sanitizeForJSON({
            ...data.result,
            ...reducerResults
          })

          const groupByProperty =
            viewValue?.format?.collection_group_by?.property
          const collectionSchema = recordMap.collection?.[collectionId]?.value?.schema
          const schemaType = collectionSchema?.[groupByProperty]?.type
          const groupType =
            viewValue?.format?.collection_group_by?.type ?? schemaType ?? 'select'

          if (!hasGroupedBlocks(normalizedResult) && groupByProperty) {
            console.debug('[grouped-collection] list groups raw', {
              viewId,
              collectionId,
              listGroups: normalizedResult?.list_groups,
              reducerKeys: Object.keys(normalizedResult?.reducerResults || {})
            })
            const bucketMap = new Map<string, Set<string>>()
            const UNCATEGORIZED_KEY = 'uncategorized'
            const UNCATEGORIZED_LABEL = 'Uncategorized'

            for (const [blockId, blockWrapper] of Object.entries(
              recordMap.block ?? {}
            )) {
              const blockValue: any = (blockWrapper as any)?.value
              if (!blockValue || blockValue.parent_table !== 'collection') continue
              if (blockValue.parent_id !== collectionId) continue
              if (blockValue.alive === false) continue

              const propertyValue = blockValue.properties?.[groupByProperty]

              if (!propertyValue) {
                console.debug('[grouped-collection] missing property value', {
                  viewId,
                  collectionId,
                  blockId,
                  availableProperties: Object.keys(blockValue.properties ?? {})
                })
              }

              const labels: string[] = []
              if (Array.isArray(propertyValue)) {
                for (const item of propertyValue) {
                  if (Array.isArray(item)) {
                    const [raw] = item
                    if (typeof raw === 'string') {
                      labels.push(raw)
                    } else if (Array.isArray(raw) && typeof raw[0] === 'string') {
                      labels.push(raw[0])
                    }
                  } else if (typeof item === 'string') {
                    labels.push(item)
                  }
                }
              }

              if (labels.length === 0) {
                if (!bucketMap.has(UNCATEGORIZED_KEY)) {
                  bucketMap.set(UNCATEGORIZED_KEY, new Set())
                }
                bucketMap.get(UNCATEGORIZED_KEY)!.add(blockId)
              } else {
                for (const label of labels) {
                  if (!bucketMap.has(label)) {
                    bucketMap.set(label, new Set())
                  }
                  bucketMap.get(label)!.add(blockId)
                }
              }
            }

          if (bucketMap.size > 0) {
              const bucketEntries = Array.from(bucketMap.entries()).map(
                ([label, set]) => ({
                  originalLabel: label,
                  displayLabel:
                    label === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : label,
                  set
                })
              )
              const updatedReducers: Record<string, any> = {
                ...normalizedResult?.reducerResults
              }
              const topLevelEntries: Record<string, any> = {}
              const listGroupResults: any[] = []
              const allBlockIds = new Set<string>()

              console.debug('[grouped-collection] buckets built', {
                viewId,
                collectionId,
                buckets: bucketEntries.map(({ displayLabel, set }) => ({
                  label: displayLabel,
                  count: set.size
                }))
              })

              for (const { originalLabel, displayLabel, set } of bucketEntries) {
                const blockIds = Array.from(set)
                for (const id of blockIds) allBlockIds.add(id)

                const originalResultsKey = `results:${groupType}:${originalLabel}`
                const originalAggregationKey = `group_aggregation:${groupType}:${originalLabel}`

                delete updatedReducers[originalResultsKey]
                delete updatedReducers[originalAggregationKey]
                delete (normalizedResult as any)[originalResultsKey]
                delete (normalizedResult as any)[originalAggregationKey]

                const resultsKey = `results:${groupType}:${displayLabel}`
                const aggregationKey = `group_aggregation:${groupType}:${displayLabel}`

                const resultEntry = {
                  type: 'results',
                  blockIds,
                  hasMore: false
                }

                const aggregationEntry = {
                  type: 'aggregation',
                  aggregationResult: {
                    type: 'number',
                    value: blockIds.length
                  }
                }

                updatedReducers[resultsKey] = resultEntry
                updatedReducers[aggregationKey] = aggregationEntry
                topLevelEntries[resultsKey] = resultEntry
                topLevelEntries[aggregationKey] = aggregationEntry

                listGroupResults.push({
                  value: {
                    type: groupType,
                    value: displayLabel
                  },
                visible: true
              })
            }

              normalizedResult = sanitizeForJSON({
                ...normalizedResult,
                collection_group_results: {
                  type: 'results',
                  blockIds: Array.from(allBlockIds),
                  hasMore: false
                },
                ...topLevelEntries,
                list_groups: {
                  type: 'groups',
                  version: 'v2',
                  hasMore: false,
                  results: listGroupResults
                },
                reducerResults: {
                  ...updatedReducers,
                  ...topLevelEntries
                }
              })

              if (Array.isArray(normalizedResult?.list_groups?.results)) {
                normalizedResult.list_groups.results = normalizedResult.list_groups.results.map(
                  (group: any, index: number) => {
                    if (!group) return group
                    const entry = bucketEntries[index]
                    const displayLabel =
                      entry?.displayLabel ?? UNCATEGORIZED_LABEL

                    if (
                      typeof group.value === 'object' &&
                      group.value !== null
                    ) {
                      return {
                        ...group,
                        value: {
                          ...group.value,
                          type: groupType,
                          value: displayLabel
                        }
                      }
                    }

                    return {
                      ...group,
                      value: {
                        type: groupType,
                        value: displayLabel
                      }
                    }
                  }
                )

                const view = recordMap.collection_view?.[viewId]
                if (view?.value?.format) {
                  view.value.format.collection_groups = bucketEntries.map(
                    ({ displayLabel }) =>
                    normalizeGroupValue({
                      value: {
                        type: groupType,
                        value: displayLabel
                      },
                      property: groupByProperty,
                      hidden: false
                    })
                  )
                }
              }
            }
          }

          if (!recordMap.collection_query) {
            recordMap.collection_query = {}
          }

          if (!recordMap.collection_query[collectionId]) {
            recordMap.collection_query[collectionId] = {}
          }

          recordMap.collection_query[collectionId][viewId] = normalizedResult

          const listGroups = normalizedResult?.list_groups?.results
          if (Array.isArray(listGroups) && listGroups.length > 0) {
            const view = recordMap.collection_view?.[viewId]
            const propertyKey =
              recordMap.collection_view?.[viewId]?.value?.format?.collection_group_by
                ?.property
            if (view?.value?.format) {
              view.value.format.collection_groups = listGroups.map((group: any) => {
                const normalizedGroup = normalizeGroupValue({
                  value: group?.value,
                  property: propertyKey,
                  hidden: group?.visible === false
                })
                return normalizedGroup
              })
            }
          }
        }
      } catch (err: any) {
        console.warn(
          `[grouped-collection] fetch failed ${collectionId}:${viewId}`,
          err?.message ?? err
        )
      }
    },
    { concurrency: 1 }
  )

  return recordMap
}

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  const cacheKey = getPageCacheKey(pageId)

  if (isNotionPageCacheEnabled) {
    const memoryCached = getCachedRecordMapFromMemory(cacheKey)
    if (memoryCached) {
      const hydratedCached = await hydrateGroupedCollectionData(memoryCached)
      setCachedRecordMapInMemory(cacheKey, hydratedCached)
      await writeCachedRecordMap(cacheKey, hydratedCached)
      return hydratedCached
    }

    const persistentCached = await readCachedRecordMap(cacheKey)
    if (persistentCached) {
      const hydratedPersistent = await hydrateGroupedCollectionData(persistentCached)
      setCachedRecordMapInMemory(cacheKey, hydratedPersistent)
      await writeCachedRecordMap(cacheKey, hydratedPersistent)
      return hydratedPersistent
    }
  }

  const existingFetch = inFlightPageFetches.get(cacheKey)

  if (existingFetch) {
    return existingFetch
  }

  const fetchPromise = (async () => {
    const recordMap = await loadPageFromNotion(pageId)
    const hydratedRecordMap = await hydrateGroupedCollectionData(recordMap)

    await writeCachedRecordMap(cacheKey, hydratedRecordMap)

    return hydratedRecordMap
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

