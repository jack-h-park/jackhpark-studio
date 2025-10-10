'use client'
import type { CollectionQueryResult, ExtendedRecordMap } from 'notion-types'
import dynamic from 'next/dynamic'
import router from 'next/router'
import { parsePageId } from 'notion-utils'
import * as React from 'react'
import ReactModal from 'react-modal'
import { type MapImageUrlFn ,type  NotionComponents } from 'react-notion-x'
// ??react-notion-x 湲곕낯 而댄룷?뚰듃 濡쒕뱶
import { Code } from 'react-notion-x/build/third-party/code'
import { Collection } from 'react-notion-x/build/third-party/collection'
import { Equation } from 'react-notion-x/build/third-party/equation'
import { Modal } from 'react-notion-x/build/third-party/modal'
import { Pdf } from 'react-notion-x/build/third-party/pdf'

const NotionRenderer = dynamic(
  async () => (await import('react-notion-x')).NotionRenderer,
  { ssr: false }
)

let modalInitialized = false

interface NotionPageRendererProps {
  recordMap: ExtendedRecordMap
  darkMode?: boolean
  fullPage?: boolean
  rootPageId?: string
  canonicalPageMap?: Record<string, string>
  mapPageUrl?: (id: string) => string
  mapImageUrl?: MapImageUrlFn
  pageAside?: React.ReactNode
  footer?: React.ReactNode
  components?: Partial<NotionComponents> // ??components prop 異붽?
  onOpenPeek?: (pageId: string) => void // ??遺紐⑥뿉???꾨떖諛쏆쓣 肄쒕갚
}

export function NotionPageRenderer({
  recordMap,
  darkMode,
  fullPage,
  rootPageId,
  canonicalPageMap,
  mapPageUrl,
  mapImageUrl,
  pageAside,
  footer,
  components: parentComponents, // ??prop ?대쫫 蹂寃?
  onOpenPeek
}: NotionPageRendererProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    // DOM???뺤떎??以鍮꾨맂 ?꾩뿉 mount
    const timer = requestAnimationFrame(() => setMounted(true))

    if (typeof window !== 'undefined' && !modalInitialized) {
      const el = document.querySelector('.notion-frame') || document.body
      ReactModal.setAppElement(el as HTMLElement)
      modalInitialized = true
    }

    return () => cancelAnimationFrame(timer)
  }, [])

  const sanitizedRecordMap = React.useMemo<ExtendedRecordMap>(() => {
    const views = recordMap?.collection_view
    if (!views) {
      return recordMap
    }

    let hasChanges = false
    const patchedViews = { ...views }

    for (const [viewId, view] of Object.entries(views)) {
      const viewValue = view?.value

      if (!view || !viewValue || viewValue.type !== 'list') {
        continue
      }

      const format = viewValue.format

      const listProperties = format?.list_properties

      if (!Array.isArray(listProperties) || listProperties.length === 0) {
        continue
      }

      let viewChanged = false

      const patchedListProperties = listProperties.map((propertyConfig) => {
        if (!propertyConfig || typeof propertyConfig !== 'object') {
          return propertyConfig
        }

        if (propertyConfig.visible === false) {
          return propertyConfig
        }

        if (propertyConfig.property !== 'title') {
          return propertyConfig
        }

        viewChanged = true
        return { ...propertyConfig, visible: false }
      })

      if (!viewChanged) {
        continue
      }

      hasChanges = true
      patchedViews[viewId] = {
        ...view,
        value: {
          ...viewValue,
          format: {
            ...viewValue.format,
            list_properties: patchedListProperties
          }
        }
      }
    }

    if (!hasChanges) {
      return recordMap
    }

    return {
      ...recordMap,
      collection_view: patchedViews
    }
  }, [recordMap])

  React.useEffect(() => {
    if (!recordMap?.collection_view) {
      console.log('[CollectionDebug] no collection views present')
      return
    }

    for (const [viewId, view] of Object.entries(recordMap.collection_view)) {
      const viewValue: any = view?.value
      if (!viewValue) {
        console.log('[CollectionDebug] missing view value', { viewId })
        continue
      }

      const collectionId: string | undefined = viewValue.collection_id
      const queryEntry =
        collectionId &&
        recordMap.collection_query?.[collectionId]?.[viewId]

      const format = viewValue.format ?? {}
      const collectionGroups = format?.collection_groups
      const boardColumns = format?.board_columns
      const groupBy = format?.collection_group_by ?? format?.board_columns_by

      const queryResult =
        typeof queryEntry === 'object' && queryEntry !== null
          ? (queryEntry as CollectionQueryResult)
          : null

      const reducerResults =
        queryResult &&
        queryResult.reducerResults &&
        typeof queryResult.reducerResults === 'object'
          ? (queryResult.reducerResults as Record<string, any>)
          : null

      const blockIdsLength = queryResult?.blockIds?.length ?? null

      console.log('[CollectionDebug] view snapshot', {
        viewId,
        collectionId,
        viewType: viewValue.type,
        hasGrouping: Boolean(groupBy) || Boolean(collectionGroups),
        groupBy,
        collectionGroupsLength: Array.isArray(collectionGroups)
          ? collectionGroups.length
          : 0,
        boardColumnsLength: Array.isArray(boardColumns)
          ? boardColumns.length
          : 0,
        queryKeys: queryResult ? Object.keys(queryResult) : null,
        reducerKeys: reducerResults ? Object.keys(reducerResults) : null,
        resultsBuckets: reducerResults
          ? Object.entries(reducerResults)
              .filter(([key, value]: [string, any]) => {
                return (
                  key.startsWith('results:') &&
                  Boolean(value?.blockIds?.length ?? 0)
                )
              })
              .map(([key, value]: [string, any]) => ({
                key,
                count: value?.blockIds?.length ?? 0
              }))
          : null,
        fallbackBlockIdsLength: blockIdsLength
      })
    }
  }, [recordMap])



  // ??遺紐?而댄룷?뚰듃?먯꽌 諛쏆? components? PageLink ?ㅻ쾭?쇱씠?쒕? 蹂묓빀
  const components = React.useMemo(
    () => ({
      ...parentComponents,
      Code,
      Collection,
      Equation,
      Pdf,
      Modal,
      PageLink: ({ href, children, className, ...props }: any) => {
        if (!href) return <a {...props}>{children}</a>

        const isExternal =
          href.startsWith('http://') || href.startsWith('https://')
        const pageId =
          parsePageId(href) ||
          canonicalPageMap?.[href.replaceAll(/^\/+|\/+$/g, '')]

        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()

          console.log('[PageLink clicked]', href)
          console.log('canonicalPageMap?', canonicalPageMap)
          console.log('onOpenPeek 議댁옱?', !!onOpenPeek)
          console.log('onOpenPeek pageId?', pageId)

          // ?몙 ?ш린??element瑜?紐낆떆?곸쑝濡??좎뼵?댁빞 ??
          const element = e.currentTarget as HTMLElement

          // ??inline database ?대??몄? ?먮퀎
          const isInlineDBLink = !!element.closest('.notion-collection')

          // ??inline DB ??留곹겕留?Side Peek
          if (isInlineDBLink && pageId && onOpenPeek) {
            onOpenPeek(pageId)
            return
          }

          // ?몃? 留곹겕硫???李?
          if (isExternal) {
            window.open(href, '_blank')
            return
          }

          // ?대? ?섏씠吏 ?대룞
          void router.push(href)
        }

        return (
          <a href={href} className={className} {...props} onClick={handleClick}>
            {children}
          </a>
        )
      }
    }),
    [canonicalPageMap, onOpenPeek, parentComponents]
  )

  // ??NotionRenderer 諛섑솚
  return (
    <div className='notion-frame'>
      {mounted ? (
        <NotionRenderer
          recordMap={sanitizedRecordMap}
          darkMode={darkMode}
          fullPage={fullPage}
          rootPageId={rootPageId}
          mapPageUrl={mapPageUrl}
          mapImageUrl={mapImageUrl}
          pageAside={pageAside}
          footer={footer}
          components={components}
        />
      ) : null}
    </div>
  )
}


