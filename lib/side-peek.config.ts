/**
 * Inline database IDs (collection parent IDs) that should opt out of Side Peek.
 * Provide the 32-character ID without dashes.
 */
export const SIDE_PEEK_DISABLED_COLLECTION_IDS = new Set<string>([
  // 'yourcollectionidwithoutdashes'
])

/**
 * Inline database block IDs (collection view blocks) that should opt out of Side Peek.
 * This matches the anchor ID you see after the hash in a Notion URL or the CSS class notion-block-....
 */
export const SIDE_PEEK_DISABLED_COLLECTION_BLOCK_IDS = new Set<string>([
  '28999029c0b4807db66ced4bf2bb2c44',
  '28999029c0b4807d8fccc28074f8ee6f'
])
