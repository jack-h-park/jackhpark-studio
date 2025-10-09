'use client'
import * as React from 'react'
import { useState } from 'react'
import type { MapImageUrlFn } from 'react-notion-x'
import type { NotionComponents } from 'react-notion-x'
import dynamic from 'next/dynamic'
import type { ExtendedRecordMap } from 'notion-types'

// ✅ react-notion-x 기본 컴포넌트 로드
import { Code } from 'react-notion-x/build/third-party/code'
import { Collection } from 'react-notion-x/build/third-party/collection'
import { Equation } from 'react-notion-x/build/third-party/equation'
import { Pdf } from 'react-notion-x/build/third-party/pdf'
import { Modal } from 'react-notion-x/build/third-party/modal'
import ReactModal from 'react-modal'

import { parsePageId } from 'notion-utils'
import router from 'next/router'

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
  components?: Partial<NotionComponents> // ✅ components prop 추가
  onOpenPeek?: (pageId: string) => void // ✅ 부모에서 전달받을 콜백
}

export const NotionPageRenderer: React.FC<NotionPageRendererProps> = ({
  recordMap,
  darkMode,
  fullPage,
  rootPageId,
  canonicalPageMap,
  mapPageUrl,
  mapImageUrl,
  pageAside,
  footer,
  components: parentComponents, // ✅ prop 이름 변경
  onOpenPeek
}) => {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    // DOM이 확실히 준비된 후에 mount
    const timer = requestAnimationFrame(() => setMounted(true))

    if (typeof window !== 'undefined' && !modalInitialized) {
      const el = document.querySelector('.notion-frame') || document.body
      ReactModal.setAppElement(el as HTMLElement)
      modalInitialized = true
    }

    return () => cancelAnimationFrame(timer)
  }, [])

  const sanitizedRecordMap = React.useMemo(() => {
    const views = recordMap?.collection_view
    if (!views) {
      return recordMap
    }

    let hasChanges = false
    const patchedViews: Partial<typeof views> = {}

    Object.entries(views).forEach(([viewId, view]) => {
      const viewValue = view?.value

      if (!viewValue || viewValue.type !== 'list') {
        return
      }

      const listProperties = viewValue.format?.list_properties

      if (!Array.isArray(listProperties) || listProperties.length === 0) {
        return
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
        return
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
    })

    if (!hasChanges) {
      return recordMap
    }

    return {
      ...recordMap,
      collection_view: {
        ...views,
        ...patchedViews
      }
    }
  }, [recordMap])


  // ✅ 부모 컴포넌트에서 받은 components와 PageLink 오버라이드를 병합
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
          canonicalPageMap?.[href.replace(/^\/+|\/+$/g, '')]

        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()

          console.log('[PageLink clicked]', href)
          console.log('canonicalPageMap?', canonicalPageMap)
          console.log('onOpenPeek 존재?', !!onOpenPeek)
          console.log('onOpenPeek pageId?', pageId)

          // 👇 여기서 element를 명시적으로 선언해야 함
          const element = e.currentTarget as HTMLElement

          // ✅ inline database 내부인지 판별
          const isInlineDBLink = !!element.closest('.notion-collection')

          // ✅ inline DB 내 링크만 Side Peek
          if (isInlineDBLink && pageId && onOpenPeek) {
            onOpenPeek(pageId)
            return
          }

          // 외부 링크면 새 창
          if (isExternal) {
            window.open(href, '_blank')
            return
          }

          // 내부 페이지 이동
          router.push(href)
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

  // ✅ NotionRenderer 반환
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
