/**
 * Gallery collection-card cover content (image discovery + generated "thesis"
 * covers for image-less pages).
 *
 * This used to live inside the react-notion-x fork. It now lives here so the
 * fork stays thin and upstream-rebaseable — the library only exposes a
 * `components.collectionCardCover` seam and this file plugs into it via
 * `renderCollectionCardCover` (bottom of file).
 *
 * TUNABLES — content/language-specific knobs, tuned for mixed English + Korean:
 *   - `weakHeadingTexts` and the section-label regex in
 *     stripLeadingDecoration: label lists (both languages included).
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
  ExtendedRecordMap,
  PreviewImage
} from 'notion-types'
import type { CollectionCardCoverOverrideFn, MapImageUrlFn } from 'react-notion-x'
import { getBlockIcon, getTextContent, normalizeUrl } from 'notion-utils'
import React from 'react'

import type { NotionImageRole } from './notion-image-delivery'

type ThumbnailImageCandidate = {
  kind: 'image'
  src: string
  alt: string
  objectPosition: string
}

// Notion palette hues; their `_background` variants already flip with dark
// mode. The full set is reachable through a topic property's own colour.
type CoverTint =
  | 'blue'
  | 'purple'
  | 'pink'
  | 'teal'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'brown'
  | 'gray'

// The subset the id hash may pick when a page has no topic. Yellow, red, brown
// and gray are left out: as an arbitrary assignment they read as a status
// (warning, error, disabled) that the page does not actually carry.
const fallbackCoverTints: readonly CoverTint[] = [
  'blue',
  'purple',
  'pink',
  'teal',
  'orange'
]

// Notion's select-option colours. 'green' has no `--notion-green_background`
// in the stylesheet, so it lands on the nearest hue that does.
const notionColorToTint: Record<string, CoverTint> = {
  blue: 'blue',
  purple: 'purple',
  pink: 'pink',
  green: 'teal',
  orange: 'orange',
  red: 'red',
  yellow: 'yellow',
  brown: 'brown',
  gray: 'gray'
}

// The collection property whose value colours the card. Matched by name, case
// and spacing insensitively, so renaming the column in Notion is what changes
// the binding — not a code edit.
const topicPropertyNames = new Set(['topic', 'topics'])

// Image-less pages get a generated cover. It keeps Notion's own card anatomy —
// the page's opening content, read top-to-bottom — and adds hierarchy on top:
// a per-page tint, the page icon, and the opening sentence promoted to a lead
// line so the card has something to catch on before the prose continues.
type ThumbnailThesisCandidate = {
  kind: 'thesis'
  tint: CoverTint
  icon?: string
  eyebrow?: string
  lead: string
  body?: string
}

type ThumbnailEmptyCandidate = {
  kind: 'empty'
}

export type CollectionCardCoverCandidate =
  | ThumbnailImageCandidate
  | ThumbnailThesisCandidate
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

function getBlockChildren(block: Block | undefined): string[] {
  return Array.isArray(block?.content) ? block.content : []
}

// Consumer-local block unboxer. notion-utils@7.7.1 (pinned here) predates
// getBlockValue, and some Notion records are doubly-nested {value:{value}}.
function unwrapBlock(box: unknown): Block | undefined {
  let node: unknown = box
  while (
    node &&
    typeof node === 'object' &&
    'value' in node &&
    (node as { value?: unknown }).value
  ) {
    node = (node as { value?: unknown }).value
  }
  return node && typeof node === 'object' && (node as { id?: unknown }).id
    ? (node as Block)
    : undefined
}

// Same {value:{value}} unboxing, for the collection record that carries the
// property schema.
function unwrapCollection(box: unknown): { schema?: unknown } | undefined {
  let node: unknown = box
  while (
    node &&
    typeof node === 'object' &&
    'value' in node &&
    (node as { value?: unknown }).value
  ) {
    node = (node as { value?: unknown }).value
  }
  return node && typeof node === 'object' && 'schema' in node
    ? (node as { schema?: unknown })
    : undefined
}

/**
 * Read a string field off a block's `format`. notion-types types `format` per
 * block variant, and display_source / page_cover are not declared on all of
 * them even though Notion sets them.
 */
function readFormatString(block: Block, key: string): string | undefined {
  const format = (block as { format?: Record<string, unknown> }).format
  const value = format?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
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
    readFormatString(block, 'display_source') ??
    null
  )
}

/** Mirrors the two-key lookup react-notion-x's LazyImage does. */
function getPreviewImage(
  src: string,
  recordMap: ExtendedRecordMap
): PreviewImage | null {
  const previewImage =
    recordMap.preview_images?.[src] ??
    recordMap.preview_images?.[normalizeUrl(src)]

  return previewImage?.dataURIBase64 ? previewImage : null
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
    const displaySource = readFormatString(block, 'display_source')
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
    // Attachments only render as a thumbnail when the file itself is an image;
    // a PDF in an <img> is just a broken cover. This used to gate on
    // `recordMap.preview_images`, which never contains attachments —
    // getPageImageUrls only scans image blocks, covers and icons — so the
    // branch could never be reached.
    const source = getBlockSource(block)
    const src = source ? mapImageUrl(source, block) : null
    if (!src || !isImageLikeUrl(src)) return null

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
// A single flat class quantified once — not `(?:X+\s*)+`, whose nested
// quantifiers let the engine partition a long emoji run across iterations in
// exponentially many ways before failing (a real ReDoS shape; the trailing
// .trim() below makes folding whitespace into the same class harmless).
function stripLeadingEmoji(text: string): string {
  return text
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}️‍\s]+/u, '')
    .trim()
}

function normalizeComparableText(text: string | undefined): string {
  return (text || '')
    .toLowerCase()
    .replaceAll(/[\s:;,.!?()[\]'"`+-]+/g, ' ')
    .trim()
}

function shouldSuppressHeading(
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

// Enough opening text to get past a leading series note such as
// "(Part 2 of a two-part pair …)" and still fill the cover after the lead.
const OPENING_SOURCE_BUDGET = 1200
// What is shown under the lead. Deliberately larger than the cover can hold:
// the CSS fade, not a mid-word "…", provides the visual truncation.
const PREVIEW_BODY_BUDGET = 420
const LEAD_MIN_LENGTH = 40
const LEAD_MAX_SENTENCES = 2

// Trim a leading decorative emoji (e.g. a callout icon that ended up inline)
// and any leftover short section label so the body opens on real prose.
// See stripLeadingEmoji above for why this is one flat class, quantified once.
function stripLeadingDecoration(text: string): string {
  let out = text.replace(
    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}️‍\s]+/u,
    ''
  )
  out = out.replace(
    /^(Objective|Overview|Summary|Executive Summary|Details|Context|Background|TL;DR)\b[\s:—-]*/i,
    ''
  )
  return out.trim()
}

// Collect block texts from the given blocks in document order, expanding
// callout/toggle so their inner text is included, up to a character budget.
// Kept per block: a block boundary is also a sentence boundary.
function collectOpeningText(
  blocks: Block[],
  recordMap: ExtendedRecordMap,
  budget: number
): string[] {
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

  return parts
}

// Drop a leading parenthetical aside such as "(Part 2 of a two-part pair …)":
// it is navigation between posts, not the post's argument.
function stripLeadingParenthetical(text: string): string {
  return text.replace(/^\([^()]*\)\s*/, '').trim()
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=\P{Ll})/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

const trailingDecorationChar = /[\p{Extended_Pictographic}\uFE0F\u200D\s]/u

// Walks back one code point at a time instead of an end-anchored `[…]+$`,
// which backtracks quadratically on long emoji runs (see stripLeadingEmoji).
function stripTrailingDecoration(text: string): string {
  const chars = Array.from(text)
  let end = chars.length
  while (end > 0 && trailingDecorationChar.test(chars[end - 1]!)) end--
  return chars.slice(0, end).join('')
}

// Clip at a word boundary WITHOUT a trailing ellipsis — the body relies on the
// CSS fade mask for truncation, so we never inject "…" mid-preview.
function clipAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  const slice = text.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()
}

// Split the opening into a lead and the prose that continues it. The lead is
// the opening sentence, extended by the next one when the first is too short to
// carry meaning alone ("It's 2:14 AM."); everything after it stays on the card
// as the content preview Notion itself shows.
function splitOpening(openingBlocks: string[]): {
  lead: string
  body?: string
} {
  const sentences = openingBlocks.flatMap((text, index) => {
    const cleaned = stripLeadingDecoration(text)
    return splitSentences(
      index === 0 ? stripLeadingParenthetical(cleaned) : cleaned
    )
  })

  let lead = ''
  let taken = 0
  for (const sentence of sentences.slice(0, LEAD_MAX_SENTENCES)) {
    lead = lead ? `${lead} ${sentence}` : sentence
    taken++
    if (weightedLength(lead) >= LEAD_MIN_LENGTH) break
  }

  const body = clipAtWordBoundary(
    stripTrailingDecoration(sentences.slice(taken).join(' ')),
    PREVIEW_BODY_BUDGET
  )

  return {
    // A lead that introduces a list ends on a colon. That dangles only when
    // nothing follows it on the card; when the list is right there, keep it.
    lead: body
      ? stripTrailingDecoration(lead)
      : stripTrailingDecoration(lead).replace(/:$/, '…'),
    body: body || undefined
  }
}

// Stable per page (FNV-1a over the block id), so a note keeps its colour across
// renders, reorderings and additions to the collection. Used only when the page
// has no topic — the colour is then decorative, not meaningful.
function pickFallbackTint(blockId: string): CoverTint {
  let hash = 0x81_1c_9d_c5
  for (const char of blockId) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01_00_01_93)
  }
  return fallbackCoverTints[(hash >>> 0) % fallbackCoverTints.length]!
}

type CollectionSchemaProperty = {
  name?: string
  type?: string
  options?: Array<{ value?: string; color?: string }>
}

/**
 * Resolve the card tint from the page's topic property, using the colour Notion
 * itself stores on the selected option. That keeps the mapping editable where
 * the taxonomy lives: recolouring an option in Notion recolours the cards.
 */
function resolveTopicTint(
  block: Block,
  recordMap: ExtendedRecordMap
): CoverTint | undefined {
  const collectionId = block.parent_id
  if (!collectionId) return undefined

  const collection = unwrapCollection(recordMap.collection?.[collectionId])
  const schema = collection?.schema as
    | Record<string, CollectionSchemaProperty>
    | undefined
  if (!schema) return undefined

  const entry = Object.entries(schema).find(([, property]) =>
    topicPropertyNames.has(
      (property?.name ?? '').trim().toLowerCase().replaceAll(/\s+/g, ' ')
    )
  )
  if (!entry) return undefined

  const [propertyId, property] = entry
  if (property.type !== 'select' && property.type !== 'multi_select') {
    return undefined
  }

  // multi_select values arrive comma-joined; the first one colours the card.
  const rawValue = getTextContent(block.properties?.[propertyId])
    .split(',')[0]
    ?.trim()
  if (!rawValue) return undefined

  const option = property.options?.find((candidate) => candidate.value === rawValue)
  return option?.color ? notionColorToTint[option.color] : undefined
}

// Build the cover from a CONSISTENT, predictable source: always the page's
// opening content read top-to-bottom, the same content Notion's own gallery
// card previews. A heading is used as the eyebrow only when it sits in the
// first few content blocks — never a mid-page section heading — so the cover
// can't skip the real intro and jump elsewhere.
function buildThesisCandidate(
  rootBlock: Block,
  recordMap: ExtendedRecordMap
): ThumbnailThesisCandidate | null {
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

  // A heading near the top becomes the eyebrow (the section the thesis opens),
  // and the thesis is taken from the prose that follows it.
  const HEADING_LOOKAHEAD = 4
  let heading: string | undefined
  let bodyStart = 0
  const headingIdx = meaningful
    .slice(0, HEADING_LOOKAHEAD)
    .findIndex(
      (block) => headingBlockTypes.has(block.type) && !!getHeadingText(block)
    )
  if (headingIdx !== -1) {
    const text = stripLeadingEmoji(getHeadingText(meaningful[headingIdx]!) ?? '')
    if (text && !shouldSuppressHeading(text, rootPageTitle)) {
      heading = text
    }
    bodyStart = headingIdx + 1
  }

  const { lead, body } = splitOpening(
    collectOpeningText(
      meaningful.slice(bodyStart),
      recordMap,
      OPENING_SOURCE_BUDGET
    )
  )

  const tint =
    resolveTopicTint(rootBlock, recordMap) ?? pickFallbackTint(rootBlock.id)
  const icon = normalizeIcon(getBlockIcon(rootBlock, recordMap))

  if (lead) {
    return { kind: 'thesis', tint, icon, eyebrow: heading, lead, body }
  }

  // No prose to preview: promote the heading itself so the cover still says
  // something beyond the title underneath it.
  return heading ? { kind: 'thesis', tint, icon, lead: heading } : null
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

  const pageCover = readFormatString(block, 'page_cover')
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

  const thesisCandidate = buildThesisCandidate(block, recordMap)
  if (thesisCandidate) {
    return thesisCandidate
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

// Styled in styles/notion.css; `data-tint` selects the Notion palette hue.
function CollectionCardCoverThesis({
  candidate
}: {
  candidate: ThumbnailThesisCandidate
}) {
  return (
    <div
      className='notion-collection-card-cover-thesis'
      data-tint={candidate.tint}
    >
      {candidate.icon && (
        <div
          className='notion-collection-card-cover-thesis-icon'
          aria-hidden='true'
        >
          {candidate.icon}
        </div>
      )}

      <div className='notion-collection-card-cover-thesis-text'>
        {candidate.eyebrow && (
          <div className='notion-collection-card-cover-thesis-eyebrow'>
            {candidate.eyebrow}
          </div>
        )}

        <p className='notion-collection-card-cover-thesis-lead'>
          {candidate.lead}
        </p>

        {candidate.body && (
          <p className='notion-collection-card-cover-thesis-body'>
            {candidate.body}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Minimal contract for the image component the renderer draws cover images
 * with. `NotionImage` (next/image-backed, with blur-up + error fallback)
 * satisfies this, but any `<img>`-compatible component does.
 */
type CoverImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  placeholder?: 'blur' | string
  blurDataURL?: string
  /**
   * Which width ladder the image component should serve. Cards know their own
   * size; the component cannot work it out from the class name alone.
   */
  imageRole?: NotionImageRole
}

type CoverImageComponent = React.ComponentType<CoverImageProps>

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
    Image ??
    // `imageRole` is this contract's prop, not an <img> attribute: React would
    // warn about it on a real DOM node.
    (({ imageRole: _imageRole, ...props }) => (
      <img loading='lazy' decoding='async' {...props} />
    ))

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
      // Cards render outside react-notion-x's LazyImage, so the LQIP lookup it
      // normally does has to happen here for gallery covers to blur up too.
      const previewImage = getPreviewImage(candidate.src, recordMap)

      return (
        <CoverImage
          className='notion-collection-card-cover-image'
          imageRole='card-cover'
          src={candidate.src}
          alt={candidate.alt}
          style={{
            objectFit: coverAspect,
            objectPosition: candidate.objectPosition
          }}
          {...(previewImage
            ? {
                placeholder: 'blur' as const,
                blurDataURL: previewImage.dataURIBase64
              }
            : {})}
        />
      )
    }

    if (candidate.kind === 'thesis') {
      return <CollectionCardCoverThesis candidate={candidate} />
    }

    // kind === 'empty' — let the library render its own empty cover.
    return defaultCover()
  }
}
