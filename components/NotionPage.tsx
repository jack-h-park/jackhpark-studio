'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
//import { useRouter } from 'next/router'
import { type PageBlock } from 'notion-types'
import { formatDate, getBlockTitle, getPageProperty, parsePageId } from 'notion-utils'
import * as React from 'react'
import BodyClassName from 'react-body-classname'
import { type NotionComponents, useNotionContext } from 'react-notion-x'
import { EmbeddedTweet, TweetNotFound, TweetSkeleton } from 'react-tweet'
import { useSearchParam } from 'react-use'

import type * as types from '@/lib/types'
import * as config from '@/lib/config'
import { mapImageUrl } from '@/lib/map-image-url'
import { getCanonicalPageUrl, mapPageUrl } from '@/lib/map-page-url'
import { useDarkMode } from '@/lib/use-dark-mode'
import { useSidePeek } from '@/lib/use-side-peek'

import { Footer } from './Footer'
//import { GitHubShareButton } from './GitHubShareButton'
import { Loading } from './Loading'
import { NotionPageHeader } from './NotionPageHeader'
import { NotionPageRenderer } from './NotionPageRenderer'
import { Page404 } from './Page404'
import { PageAside } from './PageAside'
import { PageHead } from './PageHead'
import { SidePeek } from './SidePeek'

// -----------------------------------------------------------------------------
// dynamic imports for optional components
// -----------------------------------------------------------------------------

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
  // ✅ 페이지 헤더에서 'author' 필드를 굵게 표시
  if (pageHeader && schema?.name?.toLowerCase() === 'author') {
    return <b>{defaultFn()}</b>
  }

  // ✅ CleanText 적용 (inline DB 텍스트 셀 포함)
  const raw =
    value ??
    data ??
    block?.properties?.[schema?.id] ??
    schema?.name ??
    defaultFn()?.toString() ??
    ''

  console.log('[propertyTextValue → CleanText]', {
    schemaName: schema?.name,
    raw
  })
  return <CleanText text={raw} />
}

console.log('[Injecting CleanText]')
// ✅ safer text renderer: normalize react-notion-x rich text → plain inline text
function renderRichText(item: any): string {
  if (!Array.isArray(item)) return typeof item === 'string' ? item : ''
  const [text, decorations]: [string, any[]] = item as [string, any[]]
  if (!decorations || !Array.isArray(decorations) || decorations.length === 0)
    return text

  let html: string = text
  for (const deco of decorations) {
    if (!Array.isArray(deco)) continue
    const [type, value] = deco as [string, string | undefined]
    switch (type) {
      case 'b':
        html = `<b>${html}</b>`
        break
      case 'i':
        html = `<i>${html}</i>`
        break
      case 'u':
        html = `<u>${html}</u>`
        break
      case 's':
        html = `<s>${html}</s>`
        break
      case 'a':
        html = `<a href="${value ?? '#'}" target="_blank" rel="noopener noreferrer">${html}</a>`
        break
      case 'c':
        html = `<code>${html}</code>`
        break
    }
  }
  return html
}

function CleanText(props: any) {
  const raw: any = props?.value ?? props?.text ?? props?.children ?? ''
  console.log('[CleanText called]', props)
  let html = ''
  try {
    if (Array.isArray(raw)) {
      html = raw.map((r) => renderRichText(r)).join('')
    } else if (typeof raw === 'string') {
      html = raw
    } else if (
      raw &&
      typeof raw === 'object' &&
      typeof (raw as any).plain_text === 'string'
    ) {
      html = (raw as any).plain_text
    } else {
      html = String(raw)
    }
  } catch (err) {
    console.warn('[CleanText error]', err)
  }

  html = html
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")

  console.log('[HTML preview]', html)

  return <span data-clean-text='1' dangerouslySetInnerHTML={{ __html: html }} />
}

type GalleryPreviewState = {
  src: string
  alt: string
  title?: string
  href?: string
}

type NotionImageProps = Omit<
  React.ComponentPropsWithoutRef<'img'>,
  'ref'
> & {
  priority?: boolean
  placeholder?: 'blur' | string
  blurDataURL?: string
}

const NotionImage = React.forwardRef<HTMLImageElement, NotionImageProps>(
  (
    { priority: _priority, placeholder: _placeholder, blurDataURL, loading, style, ...rest },
    ref
  ) => {
    const mergedStyle =
      _placeholder === 'blur' && blurDataURL
        ? {
            ...style,
            backgroundImage: `url(${blurDataURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }
        : style

    return (
      <img
        {...rest}
        ref={ref}
        loading={loading ?? 'lazy'}
        style={mergedStyle}
      />
    )
  }
)

NotionImage.displayName = 'NotionImage'

export function NotionPage({
  site,
  recordMap,
  canonicalPageMap,
  error,
  pageId
}: types.PageProps) {
  //const router = useRouter()
  const lite = useSearchParam('lite')

  const {
    isPeekOpen,
    peekRecordMap,
    isLoading: isPeekLoading,
    handleOpenPeek,
    handleClosePeek
  } = useSidePeek()

  const [galleryPreview, setGalleryPreview] =
    React.useState<GalleryPreviewState | null>(null)

  const [isZoomed, setIsZoomed] = React.useState(false)

  const handleOpenGalleryPreview = React.useCallback(
    (preview: GalleryPreviewState) => {
      console.log('[GalleryPreview] open modal request', preview)
      setGalleryPreview(preview)
    },
    []
  )

  const handleCloseGalleryPreview = React.useCallback(() => {
    console.log('[GalleryPreview] close modal request')
    setGalleryPreview(null)
    setIsZoomed(false) // 줌 상태 초기화
  }, [])

  const handleToggleZoom = React.useCallback(() => {
    setIsZoomed((prev) => !prev)
  }, [])

  const resolvePageIdFromHref = React.useCallback(
    (href: string | null | undefined): string | null => {
      if (!href) return null

      const normalized = href.replaceAll(/^\/+/g, '').replaceAll(/\/+$/g, '')
      return (
        parsePageId(normalized) ||
        canonicalPageMap?.[normalized] ||
        null
      )
    },
    [canonicalPageMap]
  )

  const getPageBlock = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return null
      const plainId = id.replaceAll('-', '')
      return (
        recordMap?.block?.[id]?.value ??
        recordMap?.block?.[plainId]?.value ??
        null
      )
    },
    [recordMap]
  )

  React.useEffect(() => {
    if (!galleryPreview) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseGalleryPreview()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [galleryPreview, handleCloseGalleryPreview])

  React.useEffect(() => {
    const handleGalleryClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const anchor = target.closest('a.notion-collection-card') as
        | HTMLAnchorElement
        | null
      if (!anchor) return

      if (!anchor.closest('.notion-gallery-view')) {
        return
      }

      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const href = anchor.getAttribute('href') || ''
      const pageId = resolvePageIdFromHref(href)

      let previewSrc: string | null = null

      const coverRoot = anchor.querySelector<HTMLElement>(
        '.notion-collection-card-cover'
      )
      const imageElement = coverRoot?.querySelector<HTMLImageElement>('img')
      const sourceElement =
        coverRoot?.querySelector<HTMLSourceElement>('source') ?? null

      if (imageElement) {
        previewSrc =
          imageElement.dataset?.src ||
          imageElement.currentSrc ||
          imageElement.getAttribute('src') ||
          null
      }

      if (!previewSrc && sourceElement) {
        const srcSet = sourceElement.getAttribute('srcset')
        if (srcSet) {
          const first = srcSet.trim().split(/\s+/)[0]
          if (first) {
            previewSrc = first
          }
        }
      }

      if (!previewSrc && coverRoot) {
        const backgroundHost =
          coverRoot.querySelector<HTMLElement>(
            '[style*="background-image"]'
          ) || coverRoot

        const inlineBackground =
          backgroundHost.style?.backgroundImage ||
          coverRoot.style?.backgroundImage ||
          ''

        const computedBackground =
          inlineBackground && inlineBackground !== 'none'
            ? inlineBackground
            : window
                .getComputedStyle(backgroundHost)
                .getPropertyValue('background-image')

        const backgroundMatch =
          computedBackground && computedBackground !== 'none'
            ? /url\((['"]?)(.+?)\1\)/i.exec(computedBackground)
            : null

        if (backgroundMatch && backgroundMatch[2]) {
          previewSrc = backgroundMatch[2]
        } else {
          const dataBackground =
            backgroundHost.dataset?.src || coverRoot.dataset?.src
          if (dataBackground) {
            previewSrc = dataBackground
          }
        }
      }

      if (!previewSrc && pageId) {
        const pageBlock = getPageBlock(pageId)
        const pageCover = pageBlock?.format?.page_cover
        if (pageBlock && pageCover) {
          previewSrc = mapImageUrl
            ? mapImageUrl(pageCover, pageBlock)
            : pageCover
        }
      }

      const titleText =
        anchor
          .querySelector(
            '.notion-collection-card-property .notion-page-title-text'
          )
          ?.textContent?.trim() || ''

      const altText =
        imageElement?.getAttribute('alt')?.trim() ||
        titleText ||
        'Gallery preview'

      handleOpenGalleryPreview({
        src: previewSrc ?? '',
        alt: altText,
        title: titleText || undefined,
        href
      })
    }

    document.addEventListener('click', handleGalleryClick, true)
    return () => document.removeEventListener('click', handleGalleryClick, true)
  }, [
    handleOpenGalleryPreview,
    mapImageUrl,
    resolvePageIdFromHref,
    getPageBlock
  ])

  // lite mode is for oembed
  const isLiteMode = lite === 'true'

  const { isDarkMode } = useDarkMode()

  const siteMapPageUrl = React.useMemo(() => {
    const params: any = {}
    if (lite) params.lite = lite

    const searchParams = new URLSearchParams(params)
    return site ? mapPageUrl(site, recordMap!, searchParams) : undefined
  }, [site, recordMap, lite])

  const keys = recordMap?.block ? Object.keys(recordMap.block) : [] // prettier-ignore
  const blockId = keys[0]
  const block =
    recordMap?.block && blockId ? recordMap.block[blockId]?.value : null

  const isBlogPost =
    block?.type === 'page' && block?.parent_table === 'collection'


      const pageAside = React.useMemo(
    () => (
      config.showPageAside
        ? <PageAside
            block={block!}
            recordMap={recordMap!}
            isBlogPost={isBlogPost}
          />
        : null
    ),
    // 의존성 배열에 showPageAside를 추가하여 이 값이 바뀔 때마다 다시 계산되도록 합니다.
    [block, recordMap, isBlogPost]
  )

  // const pageAside = React.useMemo(
  //   () => (
  //     <PageAside
  //       block={block!}
  //       recordMap={recordMap!}
  //       isBlogPost={isBlogPost}
  //     />
  //   ),
  //   [block, recordMap, isBlogPost]
  // )

  const footer = React.useMemo(() => <Footer />, [])

  // const title = block ? getBlockTitle(block, recordMap) || site.name : site.name
  const title = block
    ? getBlockTitle(block, recordMap!) || site?.name || 'Untitled'
    : site?.name || 'Untitled'

  const canonicalPageUrl =
    config.isDev || !site || !recordMap
      ? undefined
      : getCanonicalPageUrl(site, recordMap)(pageId)

  const socialImage =
    block && recordMap
      ? mapImageUrl(
          getPageProperty<string>('Social Image', block, recordMap) ||
            (block as PageBlock).format?.page_cover,
          block
        ) || mapImageUrl(config.defaultPageCover, block)
      : config.defaultPageCover

  const socialDescription =
    (block &&
      recordMap &&
      getPageProperty<string>('Description', block, recordMap)) ||
    config.description

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
      Image: NotionImage,
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
      propertyDateValue,
      Text: CleanText
    }),
    []
  )

  const peekComponents = React.useMemo<Partial<NotionComponents>>(
    () => ({
      ...components,
      Header: (_headerProps: React.ComponentProps<typeof NotionPageHeader>) =>
        null
    }),
    [components]
  )

  React.useEffect(() => {
    if (components) {
      console.log('[Notion components override]', Object.keys(components))
      if (Object.keys(components).includes('Text')) {
        console.info('✅ CleanText successfully registered')
      } else {
        console.warn('⚠️ CleanText not injected')
      }
    }
  }, [components])

  // 🔍 디버깅용: schema 전체 구조 확인
  React.useEffect(() => {
    if (recordMap?.collection) {
      for (const col of Object.values(recordMap.collection)) {
        const schema = col?.value?.schema
        if (schema) {
          console.log('🧩 Schema detected:')
          for (const [key, val] of Object.entries(schema)) {
            console.log(`${key} - ${val.name}: ${val.type}`)
          }
        }
      }
    }
  }, [recordMap])

  // 렌더링 로직 단순화
  if (!recordMap && !error) {
    return <Loading />
  }

  if (error || !block) {
    // `block`이 없으면 페이지 콘텐츠가 없는 것이므로 404로 간주
    return <Page404 site={site} pageId={pageId} error={error} />
  }

  // console.log('notion page', {
  //   isDev: config.isDev,
  //   title,
  //   pageId,
  //   rootNotionPageId: site?.rootNotionPageId,
  //   recordMap
  // })

  if (!config.isServer) {
    // add important objects to the window global for easy debugging
    const g = window as any
    g.pageId = pageId
    g.recordMap = recordMap
    g.block = block
  }

  console.log('[Render check]', { isPeekOpen, peekRecordMap })

  return (
    <>
      {header}

      {isLiteMode && <BodyClassName className='notion-lite' />}
      {isDarkMode && <BodyClassName className='dark-mode' />}

      {recordMap && (
        <NotionPageRenderer
          recordMap={recordMap}
          canonicalPageMap={canonicalPageMap}
          rootPageId={site?.rootNotionPageId}
          fullPage={!isLiteMode}
          darkMode={isDarkMode}
          components={components}
          mapPageUrl={siteMapPageUrl as any}
          mapImageUrl={mapImageUrl as any}
          pageAside={pageAside}
          footer={footer}
          onOpenPeek={handleOpenPeek}
        />
      )}

      {galleryPreview && (
        <div
          className={`gallery-image-modal__overlay ${
            isZoomed ? 'is-zoomed' : ''
          }`}
          role='dialog'
          aria-modal='true'
        >
          <button
            type='button'
            className='gallery-image-modal__backdrop'
            aria-label='Close image preview'
            onClick={handleCloseGalleryPreview}
          />
          <div className='gallery-image-modal__content'>
            <div className='gallery-image-modal__inner'>
              <button
                type='button'
                className='gallery-image-modal__close'
                onClick={handleCloseGalleryPreview}
                aria-label='Close image preview'
              >
                X
              </button>

              <div
                className='gallery-image-modal__image'
                onClick={handleToggleZoom}
                title={isZoomed ? 'Zoom out' : 'Zoom in'}
              >
                {galleryPreview.src ? (
                  <img src={galleryPreview.src} alt={galleryPreview.alt} />
                ) : (
                  <div className='gallery-image-modal__image--placeholder'>
                    Image preview unavailable.
                  </div>
                )}
              </div>

              {(galleryPreview.title || galleryPreview.href) && (
                <div className='gallery-image-modal__meta'>
                  {galleryPreview.title && (
                    <div className='gallery-image-modal__title'>
                      {galleryPreview.title}
                    </div>
                  )}

                  {galleryPreview.href && (
                    <a
                      className='gallery-image-modal__link'
                      href={galleryPreview.href}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      Open page
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SidePeek isOpen={isPeekOpen} onClose={handleClosePeek}>
        {isPeekLoading && <Loading />}
        {peekRecordMap && (
          <NotionPageRenderer
            recordMap={peekRecordMap}
            rootPageId={site?.rootNotionPageId}
            canonicalPageMap={canonicalPageMap}
            fullPage={!isLiteMode}
            darkMode={isDarkMode}
            components={peekComponents}
            mapPageUrl={siteMapPageUrl as any}
            mapImageUrl={mapImageUrl as any}
          />
        )}
      </SidePeek>
    </>
  )
}
// inline grouped list title hiding implemented via sanitized NotionPageRenderer.
