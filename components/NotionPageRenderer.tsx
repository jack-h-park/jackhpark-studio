'use client'
import type { CollectionQueryResult, ExtendedRecordMap } from 'notion-types'
import dynamic from 'next/dynamic'
import router from 'next/router'
import { parsePageId } from 'notion-utils'
import * as React from 'react'
import ReactModal from 'react-modal'
import { type MapImageUrlFn ,type  NotionComponents } from 'react-notion-x'
// react-notion-x에서 제공하는 서드파티 컴포넌트를 직접 임포트
import { Code } from 'react-notion-x/build/third-party/code'
import { Collection } from 'react-notion-x/build/third-party/collection'
import { Equation } from 'react-notion-x/build/third-party/equation'
import { Modal } from 'react-notion-x/build/third-party/modal'
import { Pdf } from 'react-notion-x/build/third-party/pdf'

import { SIDE_PEEK_DISABLED_COLLECTION_BLOCK_IDS,SIDE_PEEK_DISABLED_COLLECTION_IDS } from '@/lib/side-peek.config'

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
  components?: Partial<NotionComponents> // 상위에서 전달되는 사용자 정의 컴포넌트
  onOpenPeek?: (pageId: string) => void // 사이드 피크를 여는 콜백
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
  components: parentComponents, // 부모에서 전달된 커스텀 컴포넌트
  onOpenPeek
}: NotionPageRendererProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    // DOM이 준비된 뒤 모달 접근성 대상으로 등록하고 마운트 상태 업데이트
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



  // 사용자 정의 PageLink를 주입해 사이드 피크와 라우팅을 제어
  const components = React.useMemo(
    () => ({
      ...parentComponents,
      Code,
      Collection,
      Equation,
      Pdf,
      Modal,
      PageLink: ({ href, children, className, ...props }: any) => {
        if (!href) {
          return (
            <a className={className} {...props}>
              {children}
            </a>
          )
        }

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
          console.log('onOpenPeek 콜백 존재?', !!onOpenPeek)
          console.log('onOpenPeek pageId?', pageId)

          // Identify the inline collection element (if any) that owns this link
          const element = e.currentTarget as HTMLElement
          const collectionElement = element.closest('.notion-collection') as HTMLElement | null

          const closestDataBlockElement = collectionElement
            ? (collectionElement.closest('[data-block-id]') as HTMLElement | null)
            : null

          const inlineCollectionBlockId = collectionElement
            ? collectionElement.dataset?.blockId ??
              closestDataBlockElement?.dataset?.blockId ??
              Array.from(collectionElement.classList ?? []).find((className) =>
                className.startsWith('notion-block-')
              )?.replace('notion-block-', '') ??
              null
            : null

          const normalizedCollectionBlockId = inlineCollectionBlockId
            ? inlineCollectionBlockId.replaceAll('-', '')
            : null

          const isInlineDBLink = !!collectionElement

          const parentCollectionId = pageId
            ? sanitizedRecordMap?.block?.[pageId]?.value?.parent_id
            : null

          const normalizedParentCollectionId = parentCollectionId
            ? parentCollectionId.replaceAll('-', '')
            : null

          const shouldBypassSidePeek =
            (normalizedParentCollectionId &&
              SIDE_PEEK_DISABLED_COLLECTION_IDS.has(
                normalizedParentCollectionId
              )) ||
            (normalizedCollectionBlockId &&
              SIDE_PEEK_DISABLED_COLLECTION_BLOCK_IDS.has(
                normalizedCollectionBlockId
              ))

          // Inline DB links trigger Side Peek unless the collection opts out
          if (
            isInlineDBLink &&
            pageId &&
            onOpenPeek &&
            !shouldBypassSidePeek
          ) {
            onOpenPeek(pageId)
            return
          }

          // 외부 링크는 새 창에서 열기
          if (isExternal) {
            window.open(href, '_blank')
            return
          }

          // 내부 링크는 Next.js 라우터로 이동
          void router.push(href)
        }

        return (
          <a href={href} className={className} {...props} onClick={handleClick}>
            {children}
          </a>
        )
      }
    }),
    [canonicalPageMap, onOpenPeek, parentComponents, sanitizedRecordMap]
  )

  // 최종적으로 NotionRenderer 렌더링
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



