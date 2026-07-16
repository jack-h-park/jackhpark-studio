/**
 * Gallery collection-card cover content (image discovery + text "teaser"
 * thumbnails for image-less pages).
 *
 * This used to live inside the react-notion-x fork. It now lives here so the
 * fork stays thin and upstream-rebaseable — the library only exposes a
 * `components.collectionCardCover` seam and this file plugs into it via
 * `renderCollectionCardCover` (bottom of file).
 *
 * TUNABLES — content/language-specific knobs, tuned for mixed English + Korean:
 *   - `weakHeadingTexts`, `genericEyebrowTexts`, the inline callout regex in
 *     getCalloutOrToggleTexts: label lists (both languages included).
 *   - `isMetadataLikeText`: matches "LABEL: value" for English and, gated on
 *     Hangul, Korean "상태: 진행중" so metadata rows don't leak into the body.
 *   - `weightedLength`: CJK/Hangul characters count double, so the length gates
 *     in `getHeadingText` (>=12), `isStrongBodyText` (>=24) and `isUsefulLabel`
 *     (>=4) work for information-dense Korean without extra per-language values.
 * Adjust freely — nothing here is shared with the library. Add more languages
 * by extending the word Sets, the callout regex, and hasHangul/weightedLength.
 */
import type {
  Block,
  CollectionCardCover,
  ExtendedRecordMap
} from 'notion-types'
import type { CollectionCardCoverOverrideFn, MapImageUrlFn } from 'react-notion-x'
import { getBlockIcon, getTextContent, normalizeUrl } from 'notion-utils'
import React from 'react'

type ThumbnailImageCandidate = {
  kind: 'image'
  src: string
  alt: string
  objectPosition: string
}

type ThumbnailTeaserCandidate = {
  kind: 'teaser'
  tone: 'default' | 'callout' | 'quote'
  eyebrow?: string
  title?: string
  body: string
  icon?: string
}

type ThumbnailEmptyCandidate = {
  kind: 'empty'
}

export type CollectionCardCoverCandidate =
  | ThumbnailImageCandidate
  | ThumbnailTeaserCandidate
  | ThumbnailEmptyCandidate

const headingBlockTypes = new Set(['header', 'sub_header', 'sub_sub_header'])
const imageExtensions = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'bmp',
  'svg'
])

const transparentContainerBlockTypes = new Set([
  'column_list',
  'column',
  'synced_block',
  'transclusion_container',
  'transclusion_reference'
])
const weakHeadingTexts = new Set([
  'objective',
  'overview',
  'summary',
  'executive summary',
  'context',
  'environment',
  'status',
  'type',
  // Korean equivalents
  '개요',
  '요약',
  '목표',
  '배경',
  '상태',
  '유형',
  '맥락',
  '환경',
  '실행 요약'
])
const genericEyebrowTexts = new Set([
  'executive summary',
  'overview',
  'summary',
  'key takeaways',
  'highlights',
  // Korean equivalents
  '실행 요약',
  '개요',
  '요약',
  '핵심 요약',
  '핵심 정리',
  '하이라이트'
])

function getBlockChildren(block: Block | undefined): string[] {
  return Array.isArray(block?.content) ? block.content : []
}

// Consumer-local block unboxer. notion-utils@7.7.1 (pinned here) predates
// getBlockValue, and some Notion records are doubly-nested {value:{value}}.
function unwrapBlock(box: any): Block | undefined {
  let node: any = box
  while (node && typeof node === 'object' && 'value' in node && node.value) {
    node = node.value
  }
  return node && node.id ? (node as Block) : undefined
}

function traversePageContent(
  rootBlock: Block,
  recordMap: ExtendedRecordMap
): Block[] {
  const visited = new Set<string>()
  const blocks: Block[] = []

  function visit(blockId: string, isRoot = false) {
    if (!blockId || visited.has(blockId)) return
    visited.add(blockId)

    const block = unwrapBlock(recordMap.block[blockId])
    if (!block) return

    if (!isRoot) {
      if (block.type === 'page' || block.type === 'collection_view_page') {
        return
      }

      blocks.push(block)
    }

    for (const childId of getBlockChildren(block)) {
      visit(childId)
    }
  }

  visit(rootBlock.id, true)
  return blocks
}

function getFlattenedPreviewBlocks(
  rootBlock: Block,
  recordMap: ExtendedRecordMap,
  maxBlocks = 16
): Block[] {
  const result: Block[] = []
  const queue = [...getBlockChildren(rootBlock)]
  const visited = new Set<string>()

  while (queue.length > 0 && result.length < maxBlocks) {
    const blockId = queue.shift()
    if (!blockId || visited.has(blockId)) continue
    visited.add(blockId)

    const block = unwrapBlock(recordMap.block[blockId])
    if (!block) continue

    if (block.type === 'page' || block.type === 'collection_view_page') {
      continue
    }

    if (transparentContainerBlockTypes.has(block.type)) {
      queue.unshift(...getBlockChildren(block))
      continue
    }

    result.push(block)
  }

  return result
}

function getLoadedDescendantBlocks(
  rootBlock: Block,
  recordMap: ExtendedRecordMap,
  maxBlocks = 8
): Block[] {
  const result: Block[] = []
  const visited = new Set<string>()
  const queue = [...getBlockChildren(rootBlock)]

  while (queue.length > 0 && result.length < maxBlocks) {
    const blockId = queue.shift()
    if (!blockId || visited.has(blockId)) continue
    visited.add(blockId)

    const block = unwrapBlock(recordMap.block[blockId])
    if (!block) continue

    if (block.type === 'page' || block.type === 'collection_view_page') {
      continue
    }

    result.push(block)
    queue.push(...getBlockChildren(block))
  }

  return result
}

function getBlockPlainText(block: Block): string {
  return getTextContent(block.properties?.title).replaceAll(/\s+/g, ' ').trim()
}

function getBlockSource(block: Block): string | null {
  return (
    block.properties?.source?.[0]?.[0] ??
    (block.format as any)?.display_source ??
    null
  )
}

function hasPreviewImage(
  src: string | undefined,
  recordMap: ExtendedRecordMap
): src is string {
  if (!src) return false

  return !!(
    recordMap.preview_images?.[src] ||
    recordMap.preview_images?.[normalizeUrl(src)]
  )
}

function isImageLikeUrl(url: string): boolean {
  if (
    url.startsWith('data:image/') ||
    url.includes('/image/') ||
    url.includes('image.notionusercontent.com') ||
    url.includes('secure.notion-static.com')
  ) {
    return true
  }

  try {
    const pathname = new URL(url).pathname
    const extension = pathname.split('.').pop()?.toLowerCase()
    return !!extension && imageExtensions.has(extension)
  } catch {
    return false
  }
}

function resolveVisualCandidate(
  block: Block,
  recordMap: ExtendedRecordMap,
  mapImageUrl: MapImageUrlFn,
  objectPosition: string
): ThumbnailImageCandidate | null {
  const blockTitle = getBlockPlainText(block) || 'notion image'

  if (block.type === 'image') {
    const source = getBlockSource(block)
    if (!source) return null

    const src = mapImageUrl(source, block)
    if (!src) return null

    return {
      kind: 'image',
      src,
      alt: blockTitle,
      objectPosition
    }
  }

  if (block.type === 'video') {
    const displaySource = (block.format as any)?.display_source
    if (!displaySource || !isImageLikeUrl(displaySource)) return null

    const src = mapImageUrl(displaySource, block)
    if (!src) return null

    return {
      kind: 'image',
      src,
      alt: blockTitle || 'notion video preview',
      objectPosition
    }
  }

  if (block.type === 'pdf' || block.type === 'file') {
    const source = getBlockSource(block)
    const src = source ? mapImageUrl(source, block) : null
    if (!src || !hasPreviewImage(src, recordMap)) return null

    return {
      kind: 'image',
      src,
      alt: blockTitle || 'notion file preview',
      objectPosition
    }
  }

  return null
}

function clipText(text: string, maxChars: number): string {
  const normalized = text.replaceAll(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function hasHangul(text: string): boolean {
  return /[ᄀ-ᇿ㄰-㆏가-힣]/.test(text)
}

// CJK/Hangul/Kana characters carry ~2x the information of a Latin character, so
// count them double. This lets the same length thresholds gate both English and
// Korean text without a 7-character Korean heading being rejected as "too short".
function weightedLength(text: string): number {
  let length = 0
  for (const ch of text) {
    length += /[ᄀ-ᇿ㄰-㆏가-힣぀-ヿ㐀-鿿]/.test(
      ch
    )
      ? 2
      : 1
  }
  return length
}

function isMetadataLikeText(text: string): boolean {
  // English: "LABEL: value" (e.g. "STATUS: active", "Owner: Jane")
  if (/^([A-Z_][A-Za-z0-9_ /&(),-]{1,28}):\s+\S/.test(text)) return true

  // Korean/CJK: a short label followed by a colon and a value
  // (e.g. "상태: 진행중", "유형: 프로젝트"). Gated on hasHangul and a short
  // label so ordinary sentences that merely contain a colon aren't caught.
  if (hasHangul(text) && /^[\p{L}\p{N} /&(),-]{1,14}:\s+\S/u.test(text)) {
    return true
  }

  return false
}

function hasReadableContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

function isUsefulLabel(text: string): boolean {
  return (
    weightedLength(text) >= 4 &&
    hasReadableContent(text) &&
    !isMetadataLikeText(text)
  )
}

function isStrongBodyText(text: string): boolean {
  return (
    weightedLength(text) >= 24 &&
    hasReadableContent(text) &&
    !isMetadataLikeText(text)
  )
}

function getHeadingText(block: Block): string | undefined {
  if (!headingBlockTypes.has(block.type)) return undefined

  const text = getBlockPlainText(block)
  return weightedLength(text) >= 12 &&
    !isMetadataLikeText(text) &&
    !weakHeadingTexts.has(text.toLowerCase())
    ? clipText(text, 120)
    : undefined
}

// Keep only real emoji glyphs as icons. Notion page icons can also be uploaded
// images ("attachment:<id>:image.png"), file paths or URLs — none of which
// should ever render as text, so drop anything containing ASCII word chars.
function normalizeIcon(icon: string | null | undefined): string | undefined {
  if (!icon) return undefined
  if (/[a-z0-9]/i.test(icon) || icon.includes(':') || icon.includes('/')) {
    return undefined
  }
  return icon
}

// Remove a leading emoji from a heading so it doesn't duplicate the page icon.
function stripLeadingEmoji(text: string): string {
  return text
    .replace(/^(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}️‍]+\s*)+/u, '')
    .trim()
}

function normalizeComparableText(text: string | undefined): string {
  return (text || '')
    .toLowerCase()
    .replaceAll(/[\s:;,.!?()[\]'"`+-]+/g, ' ')
    .trim()
}

function shouldSuppressTeaserTitle(
  teaserTitle: string | undefined,
  pageTitle: string | undefined
): boolean {
  const normalizedTeaserTitle = normalizeComparableText(teaserTitle)
  const normalizedPageTitle = normalizeComparableText(pageTitle)
  if (!normalizedTeaserTitle || !normalizedPageTitle) return false

  return (
    normalizedTeaserTitle === normalizedPageTitle ||
    normalizedTeaserTitle.includes(normalizedPageTitle) ||
    normalizedPageTitle.includes(normalizedTeaserTitle)
  )
}

function finalizeTeaserCandidate(
  candidate: ThumbnailTeaserCandidate
): ThumbnailTeaserCandidate {
  const normalizedEyebrow = normalizeComparableText(candidate.eyebrow)

  // Only suppress a generic eyebrow when there is no title AND no body to give it context.
  // If body text exists, even a generic label like "Executive Summary" provides useful
  // categorization for the reader and should be shown (matching Notion's reference behavior).
  if (
    !candidate.title &&
    !candidate.body &&
    genericEyebrowTexts.has(normalizedEyebrow)
  ) {
    return {
      ...candidate,
      eyebrow: undefined,
      icon: undefined
    }
  }

  return candidate
}

// Large enough that a full opening reads onto the cover and overflows it, so
// the CSS fade — not a mid-word "…" — provides the visual truncation.
const TEASER_BODY_BUDGET = 360

// Clip to a budget at a word boundary, WITHOUT a trailing ellipsis. The teaser
// body relies on the CSS fade mask for truncation, so we never inject "…".
function clipTextNoEllipsis(text: string, maxChars: number): string {
  const normalized = text.replaceAll(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized

  const slice = normalized.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()
}

// Trim a leading decorative emoji (e.g. a callout icon that ended up inline)
// and any leftover short section label so the body opens on real prose.
function stripLeadingDecoration(text: string): string {
  let out = text.replace(
    /^(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}️‍]+\s*)+/u,
    ''
  )
  out = out.replace(
    /^(Objective|Overview|Summary|Executive Summary|Details|Context|Background|TL;DR)\b[\s:—-]*/i,
    ''
  )
  return out.trim()
}

// Collect body text from the given blocks in document order, expanding
// callout/toggle so their inner text is included, up to a character budget.
function collectTeaserBody(
  blocks: Block[],
  recordMap: ExtendedRecordMap,
  budget: number
): string {
  const parts: string[] = []
  let total = 0

  for (const block of blocks) {
    if (total >= budget) break

    // For callout/toggle, skip a short section label like "Objective" or
    // "Details" and read the inner content instead; keep the block's own text
    // only when it is substantial enough to be the body itself.
    const sources =
      block.type === 'callout' || block.type === 'toggle'
        ? isStrongBodyText(getBlockPlainText(block))
          ? [block, ...getLoadedDescendantBlocks(block, recordMap)]
          : getLoadedDescendantBlocks(block, recordMap)
        : [block]

    for (const source of sources) {
      const text = getBlockPlainText(source)
      if (!text || isMetadataLikeText(text)) continue
      if (!isStrongBodyText(text) && !isUsefulLabel(text)) continue

      parts.push(text)
      total += text.length + 1
      if (total >= budget) break
    }
  }

  return clipTextNoEllipsis(stripLeadingDecoration(parts.join(' ')), budget)
}

// Build a text teaser with a CONSISTENT, predictable source: always the page's
// opening content read top-to-bottom. A heading is used as the teaser title
// only when it is the very first content block — never a mid-page section
// heading — so the teaser can't skip the real intro and jump elsewhere.
function buildTeaserCandidate(
  rootBlock: Block,
  recordMap: ExtendedRecordMap
): ThumbnailTeaserCandidate | null {
  const previewBlocks = getFlattenedPreviewBlocks(rootBlock, recordMap)
  if (!previewBlocks.length) return null

  const rootPageTitle = getBlockPlainText(rootBlock)

  // Meaningful blocks in document order. Keep callout/quote even when their own
  // title is empty, since their children carry the text.
  const meaningful = previewBlocks.filter((block) => {
    const text = getBlockPlainText(block)
    if (!text && block.type !== 'callout' && block.type !== 'quote') return false
    if (text && isMetadataLikeText(text)) return false
    return true
  })
  if (!meaningful.length) return null

  // A heading near the top becomes the teaser's title (a topic "hook"), and the
  // body is the prose that follows it — a coherent section, not a random jump.
  // We only look within the first few blocks so the teaser can't skip deep into
  // the page; beyond that we fall back to the plain opening paragraph.
  const HEADING_LOOKAHEAD = 4
  let title: string | undefined
  let bodyStart = 0
  const headingIdx = meaningful
    .slice(0, HEADING_LOOKAHEAD)
    .findIndex(
      (block) => headingBlockTypes.has(block.type) && !!getHeadingText(block)
    )
  if (headingIdx !== -1) {
    const heading = stripLeadingEmoji(getHeadingText(meaningful[headingIdx]!) ?? '')
    if (heading && !shouldSuppressTeaserTitle(heading, rootPageTitle)) {
      title = heading
    }
    bodyStart = headingIdx + 1
  }

  // The page's own icon (usually an emoji) — a consistent splash of colour that
  // reads even when the page has no heading to promote.
  const icon = normalizeIcon(getBlockIcon(rootBlock, recordMap))

  const toneSource = meaningful[bodyStart] ?? meaningful[0]!
  const tone: 'default' | 'callout' | 'quote' =
    toneSource.type === 'quote'
      ? 'quote'
      : toneSource.type === 'callout'
        ? 'callout'
        : 'default'

  const body = collectTeaserBody(
    meaningful.slice(bodyStart),
    recordMap,
    TEASER_BODY_BUDGET
  )

  if (!body && !title) return null

  return finalizeTeaserCandidate({ kind: 'teaser', tone, icon, title, body })
}

export function getCollectionCardCoverCandidate({
  block,
  cover,
  recordMap,
  mapImageUrl,
  cardCoverPosition
}: {
  block: Block
  cover: CollectionCardCover
  recordMap: ExtendedRecordMap
  mapImageUrl: MapImageUrlFn
  cardCoverPosition: number
}): CollectionCardCoverCandidate | null {
  // `page_content` / `page_content_first` are real Notion cover types but are
  // missing from the pinned notion-types union, so compare as strings.
  const coverType = cover.type as string
  if (coverType !== 'page_content' && coverType !== 'page_content_first') {
    return null
  }

  const objectPosition = `center ${cardCoverPosition}%`
  const contentBlocks = traversePageContent(block, recordMap)

  for (const contentBlock of contentBlocks) {
    const candidate = resolveVisualCandidate(
      contentBlock,
      recordMap,
      mapImageUrl,
      objectPosition
    )
    if (candidate) {
      return candidate
    }
  }

  const pageCover = (block.format as any)?.page_cover
  if (pageCover) {
    const src = mapImageUrl(pageCover, block)
    if (src) {
      return {
        kind: 'image',
        src,
        alt: getBlockPlainText(block),
        objectPosition
      }
    }
  }

  const teaserCandidate = buildTeaserCandidate(block, recordMap)
  if (teaserCandidate) {
    return teaserCandidate
  }

  return {
    kind: 'empty'
  }
}

/* -------------------------------------------------------------------------- */
/*  Render layer                                                              */
/*                                                                            */
/*  Everything above is pure block-analysis (ported from the fork, covered by */
/*  its unit tests). Everything below turns a candidate into JSX and is what  */
/*  the react-notion-x `collectionCardCover` seam calls. All of this lives in */
/*  the consumer so the library keeps zero opinionated cover logic.           */
/* -------------------------------------------------------------------------- */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function CollectionCardCoverTeaser({
  candidate
}: {
  candidate: ThumbnailTeaserCandidate
}) {
  return (
    <div className='notion-collection-card-cover-teaser'>
      <div
        className={cx(
          'notion-collection-card-cover-teaser-panel',
          candidate.tone === 'callout' &&
            'notion-collection-card-cover-teaser-panel-callout',
          candidate.tone === 'quote' &&
            'notion-collection-card-cover-teaser-panel-quote'
        )}
      >
        {(candidate.icon || candidate.eyebrow) && (
          <div className='notion-collection-card-cover-teaser-header'>
            {candidate.icon && (
              <div className='notion-collection-card-cover-teaser-icon'>
                {candidate.icon}
              </div>
            )}

            {candidate.eyebrow && (
              <div className='notion-collection-card-cover-teaser-eyebrow'>
                {candidate.eyebrow}
              </div>
            )}
          </div>
        )}

        {candidate.title && (
          <div className='notion-collection-card-cover-teaser-title'>
            {candidate.title}
          </div>
        )}

        <div className='notion-collection-card-cover-teaser-body'>
          {candidate.body}
        </div>
      </div>
    </div>
  )
}

/**
 * Minimal contract for the image component the renderer draws cover images
 * with. `NotionImage` (next/image-backed, with blur-up + error fallback)
 * satisfies this, but any `<img>`-compatible component does.
 */
type CoverImageComponent = React.ComponentType<
  React.ImgHTMLAttributes<HTMLImageElement>
>

/**
 * Builds a `components.collectionCardCover` override, injecting the host app's
 * image component so gallery covers get the same loading/fallback behavior as
 * the rest of the site:
 *
 *   const collectionCardCover = React.useMemo(
 *     () => createCollectionCardCoverRenderer({ Image: NotionImage }),
 *     [],
 *   )
 *   <NotionRenderer components={{ collectionCardCover }} />
 *
 * Returns `defaultCover()` for anything it doesn't handle (non page-content
 * covers, empty pages) so the library's built-in behavior stays intact.
 */
export function createCollectionCardCoverRenderer({
  Image
}: {
  /** Defaults to a plain lazy <img> when omitted. */
  Image?: CoverImageComponent
} = {}): CollectionCardCoverOverrideFn {
  const CoverImage: CoverImageComponent =
    Image ?? ((props) => <img loading='lazy' decoding='async' {...props} />)

  return ({ block, cover, coverAspect, recordMap, mapImageUrl, coverPosition }, defaultCover) => {
    const candidate = getCollectionCardCoverCandidate({
      block,
      cover,
      recordMap,
      mapImageUrl,
      cardCoverPosition: coverPosition
    })

    if (!candidate) {
      return defaultCover()
    }

    if (candidate.kind === 'image') {
      return (
        <CoverImage
          className='notion-collection-card-cover-image'
          src={candidate.src}
          alt={candidate.alt}
          style={{
            objectFit: coverAspect,
            objectPosition: candidate.objectPosition
          }}
        />
      )
    }

    if (candidate.kind === 'teaser') {
      return <CollectionCardCoverTeaser candidate={candidate} />
    }

    // kind === 'empty' — let the library render its own empty cover.
    return defaultCover()
  }
}
