import * as React from 'react'
import { useState } from 'react'

import dynamic from 'next/dynamic'
import { SidePeek } from './SidePeek'
import type { ExtendedRecordMap } from 'notion-types'

// ✅ react-notion-x 기본 컴포넌트 로드
import { Code } from 'react-notion-x/build/third-party/code'
import { Collection } from 'react-notion-x/build/third-party/collection'
import { Equation } from 'react-notion-x/build/third-party/equation'
import { Pdf } from 'react-notion-x/build/third-party/pdf'
import { Modal } from 'react-notion-x/build/third-party/modal'
import ReactModal from 'react-modal'

import { parsePageId } from 'notion-utils'

const NotionRenderer = dynamic(
  async () => (await import('react-notion-x')).NotionRenderer,
  { ssr: false }
)

let modalInitialized = false

if (typeof window !== 'undefined' && !modalInitialized) {
  const el = document.querySelector('.notion-frame') || document.body
  if (el) {
    ReactModal.setAppElement(el)
    modalInitialized = true
  } else {
    // notion-frame이 아직 없으면 DOM 로드 후 재시도
    window.addEventListener('DOMContentLoaded', () => {
      const fallback = document.querySelector('.notion-frame') || document.body
      ReactModal.setAppElement(fallback)
      modalInitialized = true
    })
  }
}

interface NotionPageRendererProps {
  recordMap: ExtendedRecordMap
  darkMode?: boolean
  fullPage?: boolean
  rootPageId?: string
  mapPageUrl?: (id: string) => string
  mapImageUrl?: (url: string, block: any) => string
  pageAside?: React.ReactNode
  footer?: React.ReactNode
  onOpenPeek?: (pageId: string) => void // ✅ 부모에서 전달받을 콜백
}

export const NotionPageRenderer: React.FC<NotionPageRendererProps> = ({
  recordMap,
  darkMode,
  fullPage,
  rootPageId,
  mapPageUrl,
  mapImageUrl,
  pageAside,
  footer,
  onOpenPeek
}) => {
  if (typeof window !== 'undefined') {
    try {
      const frame = document.querySelector('.notion-frame')
      if (frame) {
        ReactModal.setAppElement(frame)
      } else {
        console.warn(
          '⚠️ .notion-frame not found yet — delaying ReactModal setup'
        )
      }
    } catch (err) {
      console.error('ReactModal init error:', err)
    }
  }

  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    // DOM이 확실히 준비된 후에 mount
    const timer = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(timer)
  }, [])

  // ✅ react-notion-x 기본 컴포넌트 + PageLink만 오버라이드
  const components = {
    Code,
    Collection,
    Equation,
    Pdf,
    Modal,
    PageLink: ({ href, children, ...props }: any) => {
      if (!href) return <a {...props}>{children}</a>

      // 내부 페이지 판별
      const isInternal =
        href.startsWith('/') ||
        href.match(/[0-9a-f]{32}/i) ||
        href.match(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
        )

      if (!isInternal) {
        return (
          <a href={href} target='_blank' rel='noopener noreferrer' {...props}>
            {children}
          </a>
        )
      }

      return (
        <a
          {...props}
          href={href}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()

            // ✅ 여기서 pageId만 정제해서 추출
            const match = href.match(/([0-9a-f]{32})$/i)
            const pageId = match ? match[1] : null

            console.log('[PageLink clicked]', href)
            console.log('onOpenPeek 존재?', !!onOpenPeek)
            console.log('onOpenPeek pageId?', pageId)

            const parsedPageId = parsePageId(pageId)

            if (parsedPageId) {
              console.log('[Extracted pageId]', parsedPageId)
              onOpenPeek?.(parsedPageId)
            } else {
              console.warn('Failed to extract pageId from href', href)
              window.location.href = href // fallback
            }
          }}
        >
          {children}
        </a>
      )
    }
    // PageLink: ({ href, children, ...props }: any) => {
    //   const isNotionLink =
    //     href?.startsWith('/') || /^[a-f0-9]{32}$/.test(href.replace(/-/g, ''))

    //   if (isNotionLink) {
    //     return (
    //       <a
    //         {...props}
    //         href={href}
    //         onClick={(e) => {
    //           e.preventDefault()
    //           const pageId = href.replace(/\//g, '').replace(/-/g, '')
    //           onOpenPeek?.(pageId) // ✅ 부모에서 전달된 콜백 호출
    //         }}
    //       >
    //         {children}
    //       </a>
    //     )
    //   }

    //   return (
    //     <a href={href} target='_blank' rel='noopener noreferrer' {...props}>
    //       {children}
    //     </a>
    //   )
    // }
  }

  // ✅ NotionRenderer 반환
  return (
    <div className='notion-frame'>
      {mounted ? (
        <NotionRenderer
          recordMap={recordMap}
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

export default NotionPageRenderer
