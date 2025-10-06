'use client'

import cs from 'classnames'
import dynamic from 'next/dynamic'
import Image from 'next/legacy/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { type PageBlock } from 'notion-types'
import { formatDate, getBlockTitle, getPageProperty } from 'notion-utils'
import * as React from 'react'
import BodyClassName from 'react-body-classname'
import {
  type NotionComponents,
  NotionRenderer,
  useNotionContext
} from 'react-notion-x'
import { EmbeddedTweet, TweetNotFound, TweetSkeleton } from 'react-tweet'
import { useSearchParam } from 'react-use'

import type * as types from '@/lib/types'
import * as config from '@/lib/config'
import { mapImageUrl } from '@/lib/map-image-url'
import { getCanonicalPageUrl, mapPageUrl } from '@/lib/map-page-url'
import { searchNotion } from '@/lib/search-notion'
import { useDarkMode } from '@/lib/use-dark-mode'

import { Footer } from './Footer'
//import { GitHubShareButton } from './GitHubShareButton'
import { Loading } from './Loading'
import { NotionPageHeader } from './NotionPageHeader'
import { Page404 } from './Page404'
import { PageAside } from './PageAside'
import { PageHead } from './PageHead'
import styles from './styles.module.css'

// import { NotionAPI } from 'notion-client'
import NotionPageRenderer from './NotionPageRenderer'
import SidePeek from './SidePeek'
import { useState, useEffect } from 'react'
import { resolveNotionPage } from '@/lib/resolve-notion-page'
import { GitHubShareButton } from './GitHubShareButton'

// -----------------------------------------------------------------------------
// dynamic imports for optional components
// -----------------------------------------------------------------------------

interface MyPropertyValueProps {
  schema: Record<string, any>
  propertyId: string
  data?: any
  block?: any
}

const Code = dynamic(() =>
  import('react-notion-x/build/third-party/code').then(async (m) => {
    // add / remove any prism syntaxes here
    await Promise.allSettled([
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markup-templating.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markup.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-bash.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-c.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-cpp.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-csharp.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-docker.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-java.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-js-templates.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-coffeescript.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-diff.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-git.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-go.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-graphql.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-handlebars.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-less.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-makefile.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markdown.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-objectivec.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-ocaml.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-python.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-reason.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-rust.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-sass.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-scss.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-solidity.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-sql.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-stylus.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-swift.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-wasm.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-yaml.js')
    ])
    return m.Code
  })
)

const Collection = dynamic(() =>
  import('react-notion-x/build/third-party/collection').then(
    (m) => m.Collection
  )
)
const Equation = dynamic(() =>
  import('react-notion-x/build/third-party/equation').then((m) => m.Equation)
)
const Pdf = dynamic(
  () => import('react-notion-x/build/third-party/pdf').then((m) => m.Pdf),
  {
    ssr: false
  }
)
const Modal = dynamic(
  () =>
    import('react-notion-x/build/third-party/modal').then((m) => {
      m.Modal.setAppElement('.notion-viewport')
      return m.Modal
    }),
  {
    ssr: false
  }
)

function Tweet({ id }: { id: string }) {
  const { recordMap } = useNotionContext()
  const tweet = (recordMap as types.ExtendedTweetRecordMap)?.tweets?.[id]

  return (
    <React.Suspense fallback={<TweetSkeleton />}>
      {tweet ? <EmbeddedTweet tweet={tweet} /> : <TweetNotFound />}
    </React.Suspense>
  )
}

const propertyLastEditedTimeValue = (
  { block, pageHeader }: any,
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && block?.last_edited_time) {
    return `Last updated ${formatDate(block?.last_edited_time, {
      month: 'long'
    })}`
  }

  return defaultFn()
}

const propertyDateValue = (
  { data, schema, pageHeader }: any,
  defaultFn: () => React.ReactNode
) => {
  console.log('🤪 propertyDateValue called:', schema?.name, schema?.type)

  if (pageHeader && schema?.name?.toLowerCase() === 'published') {
    const publishDate = data?.[0]?.[1]?.[0]?.[1]?.start_date

    if (publishDate) {
      return `${formatDate(publishDate, {
        month: 'long'
      })}`
    }
  }

  return defaultFn()
}

const propertyTextValue = (
  { schema, pageHeader, data, block, value }: any,
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'author') {
    return <b>{defaultFn()}</b>
  }

  return defaultFn()
}

export function NotionPage({
  site,
  recordMap,
  error,
  pageId
}: types.PageProps) {
  const router = useRouter()
  const lite = useSearchParam('lite')

  const [isPeekOpen, setIsPeekOpen] = React.useState(false)
  const [peekPageId, setPeekPageId] = React.useState<string | null>(null)
  const [peekRecordMap, setPeekRecordMap] = useState<any>(null)

  // lite mode is for oembed
  const isLiteMode = lite === 'true'

  const { isDarkMode } = useDarkMode()
  
  const siteMapPageUrl = React.useMemo(() => {
    const params: any = {}
    if (lite) params.lite = lite

    const searchParams = new URLSearchParams(params)
    return site ? mapPageUrl(site, recordMap!, searchParams) : undefined
  }, [site, recordMap, lite])

  const keys = recordMap?.block ? Object.keys(recordMap.block) : []
  const blockId = keys[0]
  const block = recordMap?.block && blockId ? recordMap.block[blockId]?.value : null
  const isLoading = !recordMap || !block

  const isBlogPost =
    block?.type === 'page' && block?.parent_table === 'collection'

  const showTableOfContents = !!isBlogPost
  const minTableOfContentsItems = 3

  // --- 상단 상태 추가 ---
  const [didFinishLoad, setDidFinishLoad] = React.useState(false)

  // --- 아래 useEffect 추가 ---
  React.useEffect(() => {
    if (recordMap?.block && Object.keys(recordMap.block).length > 0) {
      setDidFinishLoad(true)
    }
  }, [recordMap])

  const pageAside = React.useMemo(
    () => (
      <PageAside
        block={block!}
        recordMap={recordMap!}
        isBlogPost={isBlogPost}
      />
    ),
    [block, recordMap, isBlogPost]
  )

  const footer = React.useMemo(() => <Footer />, [])

  // const title = block ? getBlockTitle(block, recordMap) || site.name : site.name
  const title = block
    ? getBlockTitle(block, recordMap) || site?.name || 'Untitled'
    : site?.name || 'Untitled'

  const canonicalPageUrl =
    config.isDev || !site || !recordMap
      ? undefined
      : getCanonicalPageUrl(site, recordMap)(pageId)

  const socialImage = mapImageUrl(
    (block && getPageProperty<string>('Social Image', block, recordMap)) ||
      (block && (block as PageBlock).format?.page_cover) ||
      config.defaultPageCover,
    block || undefined
  )
  const socialDescription =
    getPageProperty<string>('Description', block, recordMap) ||
    config.description

  // ✅ peekPageId가 변경될 때만 실행
  React.useEffect(() => {
    if (!peekPageId) return

    console.log('[SidePeek] fetching page:', peekPageId)

    const fetchPeekPage = async () => {
      try {
        const res = await fetch(`/api/notion?id=${peekPageId}`)
        if (!res.ok) throw new Error('Failed to fetch peek page')

        const data = await res.json()
        console.log('[SidePeek] loaded page:', data)
        setPeekRecordMap(data?.recordMap || null)
        setIsPeekOpen(true)
      } catch (err) {
        console.error('[SidePeek fetch error]', err)
        setPeekRecordMap(null)
        setIsPeekOpen(false)
      }
    }

    fetchPeekPage()
  }, [peekPageId])

  const header = React.useMemo(
    () => (
      <PageHead
        pageId={pageId}
        site={site}
        title={title}
        description={socialDescription}
        image={socialImage}
        url={canonicalPageUrl}
        isBlogPost={isBlogPost}
      />
    ),
    [
      pageId,
      site,
      title,
      socialDescription,
      socialImage,
      canonicalPageUrl,
      isBlogPost
    ]
  )

  const components = React.useMemo<Partial<NotionComponents>>(
    () => ({
      nextLegacyImage: Image,
      nextLink: Link,
      Code,
      Collection,
      Equation,
      Pdf,
      Modal,
      Tweet,
      Header: NotionPageHeader,
      propertyLastEditedTimeValue,
      propertyTextValue,
      propertyDateValue
    }),
    []
  )

  // 🔍 디버깅용: schema 전체 구조 확인
  React.useEffect(() => {
    if (recordMap?.collection) {
      Object.values(recordMap.collection).forEach((col: any) => {
        const schema = col?.value?.schema
        if (schema) {
          console.log('🧩 Schema detected:')
          Object.entries(schema).forEach(([key, val]: any) =>
            console.log(`- ${val.name}: ${val.type}`)
          )
        }
      })
    }
  }, [recordMap])

  // --- 조건 정리 ---
  const hasBlocks =
    !!recordMap?.block && Object.keys(recordMap.block).length > 0
  const hasBlockValue = hasBlocks && !!block
  const isReady = hasBlockValue || didFinishLoad
  const show404 =
    !!error || (!!site && !!pageId && didFinishLoad && !hasBlockValue)

  // --- 순서 중요 ---
  if (!isReady) {
    console.log('[Render] Loading...')
    return <Loading />
  }

  if (show404) {
    console.log('[Render] Showing 404 (after load complete)')
    return <Page404 site={site} pageId={pageId} error={error} />
  }

  console.log('notion page', {
    isDev: config.isDev,
    title,
    pageId,
    rootNotionPageId: site.rootNotionPageId,
    recordMap
  })

  if (!config.isServer) {
    // add important objects to the window global for easy debugging
    const g = window as any
    g.pageId = pageId
    g.recordMap = recordMap
    g.block = block
  }

  console.log('[Render check]', { isPeekOpen, peekRecordMap })

  // 함수 컴포넌트 내부 상단 어딘가에 추가
  const handleClosePeek = () => {
    setIsPeekOpen(false)
    setPeekRecordMap(null) // 내부 NotionPageRenderer 제거
    setPeekPageId(null)
  }

  return (
    <>
      {!isReady ? (
        <Loading />
      ) : (
        <>
          {header}

          {isLiteMode && <BodyClassName className='notion-lite' />}
          {isDarkMode && <BodyClassName className='dark-mode' />}

          {/* {pageAside} */}

          <NotionPageRenderer
            recordMap={recordMap}
            rootPageId={site.rootNotionPageId}
            fullPage={!isLiteMode}
            darkMode={isDarkMode}
            components={components}
            mapPageUrl={siteMapPageUrl}
            mapImageUrl={mapImageUrl}
            pageAside={pageAside}
            footer={footer}
            onOpenPeek={(pageId: string) => {
              // ✅ 여기서 콜백 정의
              setPeekPageId(pageId)
              setIsPeekOpen(true)
            }}
          />

          <SidePeek isOpen={isPeekOpen} onClose={handleClosePeek}>
            {isPeekOpen && peekRecordMap ? (
              <NotionPageRenderer
                recordMap={peekRecordMap || {}}
                rootPageId={site.rootNotionPageId}
                fullPage={!isLiteMode}
                darkMode={isDarkMode}
                components={components}
                mapPageUrl={siteMapPageUrl}
                mapImageUrl={mapImageUrl}
              />
            ) : (
              <div className='text-white p-4'>로딩 중...</div>
            )}
          </SidePeek>

          {/* {footer} */}

          {/* <GitHubShareButton /> */}
        </>
      )}
    </>
  )
}
